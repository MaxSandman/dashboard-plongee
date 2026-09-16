import axios from 'axios';
import NodeCache from 'node-cache';
import { computeClarity, type ClarityResult } from './clarityService';
import { computeDayLight, type DayLightSummary } from './lightModel';

const cache = new NodeCache({ stdTTL: 600 });

export interface WeatherData {
  current: {
    temperature: number;
    windspeed: number;
    windgusts: number;
    winddirection: number;
    weathercode: number;
    precipitation: number;
    time: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    windspeed_10m: number[];
    windgusts_10m: number[];
    winddirection_10m: number[];
    precipitation: number[];
    weathercode: number[];
    apparent_temperature: number[];
    cloudcover: number[];
    precipitation_probability: number[];
    visibility: number[];
    surface_pressure: number[];
    uv_index: number[];
    shortwave_radiation?: number[];
  };
  marine: {
    hourly: {
      time: string[];
      // Combined wave (total sea state)
      wave_height: number[];
      wave_direction: number[];
      wave_period: number[];
      // Swell (long-period, distant origin)
      swell_wave_height: number[];
      swell_wave_direction: number[];
      swell_wave_period: number[];
      // Wind sea (locally generated)
      wind_wave_height: number[];
      wind_wave_direction: number[];
      wind_wave_period: number[];
      // Ocean surface current
      ocean_current_velocity: number[];   // m/s
      ocean_current_direction: number[];  // degrees FROM
      sea_surface_temperature: number[];
    };
  };
  daily: {
    sunrise: string[];
    sunset: string[];
  };
  location: {
    lat: number;
    lon: number;
    name: string;
  };
  marineHorizonDate?: string;
  isMock?: boolean;
  clarity?: ClarityResult;
  lightToday?: DayLightSummary;
}

function generateMockData(lat: number, lon: number, locationName: string): WeatherData {
  const now = new Date();
  const times: string[] = [];
  const temp: number[] = [];
  const wind: number[] = [];
  const windGusts: number[] = [];
  const windDir: number[] = [];
  const precip: number[] = [];
  const wcode: number[] = [];
  const marineTimes: string[] = [];
  const waveH: number[] = [];
  const waveDir: number[] = [];
  const wavePeriod: number[] = [];
  const swellH: number[] = [];
  const swellDir: number[] = [];
  const swellPeriod: number[] = [];
  const windWaveH: number[] = [];
  const windWaveDir: number[] = [];
  const windWavePeriod: number[] = [];
  const currentVel: number[] = [];
  const currentDir: number[] = [];
  const sst: number[] = [];
  const apparentTemp: number[] = [];
  const cloudcover: number[] = [];
  const precipProb: number[] = [];
  const visibility: number[] = [];
  const surfacePressure: number[] = [];
  const uvIndex: number[] = [];
  const shortwave: number[] = [];

  for (let i = 0; i < 360; i++) {
    const t = new Date(now.getTime() + i * 3600000);
    times.push(t.toISOString().slice(0, 16));
    const w = +(8 + Math.sin(i / 24) * 6 + Math.random() * 3).toFixed(1);
    const t_val = +(14 + Math.sin(i / 12) * 3 + Math.random() * 1).toFixed(1);
    temp.push(t_val);
    wind.push(w);
    windGusts.push(+(w * (1.3 + Math.random() * 0.3)).toFixed(1));
    windDir.push(Math.floor(200 + Math.sin(i / 18) * 60 + Math.random() * 20));
    precip.push(+(Math.random() < 0.2 ? Math.random() * 2 : 0).toFixed(1));
    wcode.push(Math.random() < 0.6 ? 1 : Math.random() < 0.5 ? 3 : 61);
    apparentTemp.push(+(t_val - 2 + Math.sin(i * 0.26) * 1).toFixed(1));
    const cc = Math.round(Math.max(0, Math.min(100, 50 + Math.sin(i * 0.3) * 40)));
    cloudcover.push(cc);
    precipProb.push(Math.round(Math.max(0, Math.min(100, 20 + Math.sin(i * 0.25) * 20))));
    visibility.push(Math.max(1000, 20000 - cc * 150));
    surfacePressure.push(Math.round(1013 + Math.sin(i * 0.05) * 8));
    uvIndex.push(Math.max(0, Math.round(4 + Math.sin((i % 24 - 13) * 0.4) * 4)));
    const hourOfDay = i % 24;
    shortwave.push(Math.max(0, Math.round(700 * Math.sin(Math.max(0, (hourOfDay - 6) / 12 * Math.PI)))));
    if (i < 168) {
      marineTimes.push(t.toISOString().slice(0, 16));
      const wh = +(0.4 + Math.sin(i / 20) * 0.3 + Math.random() * 0.2).toFixed(2);
      waveH.push(wh);
      waveDir.push(Math.floor(320 + Math.random() * 40));  // NW/N — onshore Normandie
      wavePeriod.push(+(6 + Math.random() * 3).toFixed(1));
      swellH.push(+(wh * 0.6).toFixed(2));
      swellDir.push(Math.floor(310 + Math.random() * 30));
      swellPeriod.push(+(9 + Math.random() * 4).toFixed(1));
      windWaveH.push(+(wh * 0.4).toFixed(2));
      windWaveDir.push(Math.floor(200 + Math.random() * 40));
      windWavePeriod.push(+(4 + Math.random() * 2).toFixed(1));
      // Tidal current: oscillates with ~12.4h period, max ~1.2 m/s in Manche
      currentVel.push(+(0.6 + Math.sin(i * (2 * Math.PI / 12.4)) * 0.5 + Math.random() * 0.1).toFixed(2));
      currentDir.push(Math.floor(i % 13 < 6 ? 50 + Math.random() * 20 : 230 + Math.random() * 20));
      sst.push(+(13 + Math.sin(i / 48) * 1.5).toFixed(1));
    }
  }

  const sunrises: string[] = [];
  const sunsets: string[] = [];
  for (let d = 0; d < 15; d++) {
    const day = new Date(now.getTime() + d * 86400000);
    const dateStr = day.toISOString().split('T')[0];
    sunrises.push(`${dateStr}T06:05`);
    sunsets.push(`${dateStr}T21:55`);
  }

  return {
    current: {
      temperature: temp[0],
      windspeed: wind[0],
      windgusts: windGusts[0],
      winddirection: windDir[0],
      weathercode: wcode[0],
      precipitation: precip[0],
      time: times[0],
    },
    hourly: {
      time: times,
      temperature_2m: temp,
      windspeed_10m: wind,
      windgusts_10m: windGusts,
      winddirection_10m: windDir,
      precipitation: precip,
      weathercode: wcode,
      apparent_temperature: apparentTemp,
      cloudcover,
      precipitation_probability: precipProb,
      visibility,
      surface_pressure: surfacePressure,
      uv_index: uvIndex,
      shortwave_radiation: shortwave,
    },
    daily: { sunrise: sunrises, sunset: sunsets },
    marineHorizonDate: marineTimes[marineTimes.length - 1] ?? new Date().toISOString(),
    marine: {
      hourly: {
        time: marineTimes,
        wave_height: waveH,
        wave_direction: waveDir,
        wave_period: wavePeriod,
        swell_wave_height: swellH,
        swell_wave_direction: swellDir,
        swell_wave_period: swellPeriod,
        wind_wave_height: windWaveH,
        wind_wave_direction: windWaveDir,
        wind_wave_period: windWavePeriod,
        ocean_current_velocity: currentVel,
        ocean_current_direction: currentDir,
        sea_surface_temperature: sst,
      },
    },
    location: { lat, lon, name: locationName },
    isMock: true,
    clarity: {
      kdTotal: 0.25,
      kdBaseline: 0.12,
      kdRiver: 0.04,
      kdWave: 0.05,
      kdPlancton: 0.04,
      visibilityM: +(2.04 / 0.25).toFixed(1),
      confidence: 'low' as const,
      orneDebitM3s: null,
      copernicus: null,
    },
    lightToday: {
      maxReadableDepthM: 18,
      lampRequiredAfterUtc: null,
      refDepthM: 15,
      noonLux: 12000,
      lightQuality: 'bright' as const,
    },
  };
}

export async function fetchWeather(lat: number, lon: number, locationName: string): Promise<WeatherData> {
  const cacheKey = `weather_${lat}_${lon}`;
  const cached = cache.get<WeatherData>(cacheKey);
  if (cached) return cached;

  try {
    const [weatherRes, marineRes] = await Promise.all([
      axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: lat,
          longitude: lon,
          current: 'temperature_2m,windspeed_10m,winddirection_10m,weathercode,precipitation,windgusts_10m',
          hourly: 'temperature_2m,windspeed_10m,windgusts_10m,winddirection_10m,precipitation,weathercode,apparent_temperature,cloudcover,precipitation_probability,visibility,surface_pressure,uv_index,shortwave_radiation',
          daily: 'sunrise,sunset',
          forecast_days: 16,
          wind_speed_unit: 'kn',
          timezone: 'Europe/Paris',
        },
      }),
      axios.get('https://marine-api.open-meteo.com/v1/marine', {
        params: {
          latitude: lat,
          longitude: lon,
          hourly: [
            'wave_height', 'wave_direction', 'wave_period',
            'swell_wave_height', 'swell_wave_direction', 'swell_wave_period',
            'wind_wave_height', 'wind_wave_direction', 'wind_wave_period',
            'ocean_current_velocity', 'ocean_current_direction',
            'sea_surface_temperature',
          ].join(','),
          forecast_days: 7,
          timezone: 'Europe/Paris',
        },
      }),
    ]);

    const data: WeatherData = {
      current: {
        temperature: weatherRes.data.current.temperature_2m,
        windspeed: weatherRes.data.current.windspeed_10m,
        windgusts: weatherRes.data.current.windgusts_10m ?? weatherRes.data.current.windspeed_10m,
        winddirection: weatherRes.data.current.winddirection_10m,
        weathercode: weatherRes.data.current.weathercode,
        precipitation: weatherRes.data.current.precipitation,
        time: weatherRes.data.current.time,
      },
      hourly: weatherRes.data.hourly,
      daily: {
        sunrise: weatherRes.data.daily.sunrise,
        sunset: weatherRes.data.daily.sunset,
      },
      marine: { hourly: marineRes.data.hourly },
      marineHorizonDate: marineRes.data.hourly.time[marineRes.data.hourly.time.length - 1] ?? new Date().toISOString(),
      location: { lat, lon, name: locationName },
    };

    // Clarté et lumière (best-effort — ne bloque pas si échec)
    try {
      const now   = new Date();
      const month = now.getMonth() + 1;
      const waveH  = marineRes.data.hourly.wave_height   as number[];
      const waveT  = marineRes.data.hourly.wave_period   as number[];
      const clarity = await computeClarity(month, waveH, waveT);
      data.clarity = clarity;

      const todayStr = now.toISOString().slice(0, 10);
      const rads: number[]  = weatherRes.data.hourly.shortwave_radiation ?? [];
      const times: string[] = weatherRes.data.hourly.time ?? [];
      data.lightToday = computeDayLight(lat, lon, todayStr, rads, times, clarity.kdTotal);
    } catch { /* dégrade silencieusement */ }

    cache.set(cacheKey, data);
    return data;
  } catch {
    const mock = generateMockData(lat, lon, locationName);
    cache.set(cacheKey, mock);
    return mock;
  }
}

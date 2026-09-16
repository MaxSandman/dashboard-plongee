// Registre central des bulles d'aide contextuelle.
// Chaque hint documente la DÉCISION que la zone aide à prendre, pas l'affichage.

export interface Hint {
  /** Ce que la zone montre (1 ligne max) */
  shows: string;
  /** La décision que cette zone sert à prendre — c'est le texte principal */
  helps: string;
  /** Comment lire l'affichage quand ce n'est pas évident (optionnel) */
  reading?: string;
  /** Ancre vers la page Méthode (ex: '#la-note') */
  methodAnchor?: string;
}

export const HINTS: Record<string, Hint> = {

  dayBar: {
    shows: 'Score à midi et score au meilleur créneau pour chaque jour de la semaine.',
    helps: 'Repère d\'un coup d\'œil les jours qui valent la peine de sortir le matériel. Un grand écart entre midi et l\'étale (+15 pts ou plus) signifie qu\'il vaut vraiment la peine de s\'organiser autour de l\'heure de PM ou BM.',
    reading: 'Barre de couleur = qualité à midi. Chip "+N pts" = ce que tu gagnes en te calant sur la marée.',
    methodAnchor: '#deux-notes',
  },

  coefficient: {
    shows: 'Coefficient de marée du jour (20 à 120).',
    helps: 'Plus le coefficient est élevé (vives-eaux > 95), plus les courants de flot/jusant seront forts et la fenêtre d\'étale courte et précieuse. En mortes-eaux (< 50), le courant est faible toute la journée : l\'heure de mise à l\'eau est moins critique.',
    reading: '~C = coefficient estimé, non officiel SHOM. Consulte maree.shom.fr pour la valeur exacte.',
    methodAnchor: '#sources',
  },

  bestWindow: {
    shows: 'Le créneau où mettre à l\'eau a le plus de sens aujourd\'hui, avec les autres étales disponibles.',
    helps: 'Choisir ce créneau plutôt qu\'une mise à l\'eau à midi peut faire passer des conditions "Moyennes" à "Bonnes" — simplement parce que le courant y est quasi nul. C\'est la fenêtre ±45 min autour de chaque PM ou BM.',
    reading: 'Le classement inclut un bonus interne +10 pts pour les créneaux de jour, qui ne s\'affiche pas dans le verdict — il sert seulement à trier les créneaux entre eux.',
    methodAnchor: '#deux-notes',
  },

  divabilityIndex: {
    shows: 'Score de 0 à 100 combinant vent, vagues, clarté, température et courant.',
    helps: '80 et plus : conditions pour plonger. 60–80 : bonne journée, vérifier le site. 40–60 : à toi de voir selon ton expérience et le site. En dessous de 40 : sauf site très abrité ou plongeur très expérimenté, mieux vaut attendre.',
    methodAnchor: '#la-note',
  },

  reliability: {
    shows: 'Fiabilité de la prévision météo selon l\'horizon temporel.',
    helps: 'Sert à calibrer ta confiance dans le score affiché. Au-delà de 5 jours, même les meilleurs modèles se trompent souvent sur l\'intensité du vent. Utilise cette barre pour décider si tu peux confirmer une sortie (> 70 %) ou si tu dois juste garder le jour en tête et reconfirmer la veille (< 50 %).',
    methodAnchor: '#au-dela-7j',
  },

  criteriaWind: {
    shows: 'Vitesse du vent en surface.',
    helps: 'Le vent dicte la sécurité de la mise à l\'eau et de la sortie. À 20 kt (37 km/h), la surface est trop agitée pour manœuvrer en toute sécurité depuis la plupart des sites normands. Au-delà de 15 kt, vérifie l\'orientation par rapport à l\'entrée d\'eau.',
    methodAnchor: '#les-cinq-criteres',
  },

  criteriaWaves: {
    shows: 'Hauteur significative des vagues (mer totale).',
    helps: '0,8 m est souvent la limite acceptable depuis une cale ou une plage normande. Au-delà de 1,2 m, les entrées/sorties depuis un bateau gonflable deviennent dangereuses. Ce chiffre combine mer de vent et houle — voir la section marine pour le détail.',
    methodAnchor: '#les-cinq-criteres',
  },

  criteriaClarity: {
    shows: 'Estimation de la clarté basée sur les précipitations de surface.',
    helps: 'Utile pour anticiper une turbidité temporaire après de fortes pluies (Orne en crue, remontée de sédiments). Après 3 jours de beau temps sec, la visibilité réelle sera presque toujours meilleure que ce proxy ne le prédit.',
    reading: 'Ce n\'est pas une mesure de la visibilité sous-marine — la turbidité dépend aussi des sédiments, du plancton et des apports fluviaux.',
    methodAnchor: '#clarte-lumiere',
  },

  criteriaTemp: {
    shows: 'Température de surface de la mer (SST).',
    helps: 'Détermine le choix de la combinaison et la durée de plongée. En dessous de 12 °C en surface, attends-toi à moins de 10 °C à 15 m de profondeur au printemps. En dessous de 10 °C, une combinaison étanche est recommandée.',
    reading: 'La SST sous-estime la température réelle en profondeur de 2 à 5 °C selon la saison et la thermocline.',
    methodAnchor: '#les-cinq-criteres',
  },

  criteriaCurrent: {
    shows: 'Vitesse du courant océanique de surface.',
    helps: 'En dehors de l\'étale, même 0,5 kt (0,25 m/s) rend difficile la navigation sous-marine. À l\'étale, le courant tombe à quasi zéro pendant 30 à 90 min — c\'est la fenêtre idéale. Plonger hors étale en vives-eaux peut être dangereux même par faible vent.',
    methodAnchor: '#les-cinq-criteres',
  },

  siteAdjustment: {
    shows: 'Multiplicateurs d\'exposition appliqués au calcul du score pour le site sélectionné.',
    helps: 'Permet d\'adapter le score à un site connu. Un site abrité derrière une pointe encaissera mieux le vent et la houle qu\'un site exposé plein ouest. Ce réglage ne change pas les conditions réelles — il corrige le biais du modèle qui ne connaît pas la topographie locale.',
    reading: 'Multiplicateur > 1 = site abrité (score amélioré). Multiplicateur < 1 = site exposé (score dégradé).',
    methodAnchor: '#ajustement-site',
  },

  tides: {
    shows: 'Heures et hauteurs des pleines et basses mers, courbe de marée, lever/coucher du soleil.',
    helps: 'Les heures de PM/BM déterminent : quand le courant est nul (étale ± 45 min), si l\'accès à l\'eau est possible selon le site, si les épaves ou tombants sont accessibles à la hauteur d\'eau prévue. Planifier sa plongée sans regarder les marées en Manche, c\'est jouer à pile ou face.',
    methodAnchor: '#sources',
  },

  tidalRange: {
    shows: 'Marnage du jour : différence de hauteur entre PM et BM.',
    helps: 'Un fort marnage (> 5 m en vives-eaux à Ouistreham) signifie des courants plus violents et une fenêtre d\'étale plus courte. Un faible marnage (mortes-eaux, < 3 m) laisse beaucoup plus de souplesse sur l\'heure de mise à l\'eau.',
  },

  marineWeather: {
    shows: 'Conditions météo marines : vent, houle, mer de vent, courant, température de surface.',
    helps: 'Sert à confirmer la cohérence entre le score calculé et les conditions prévues, et à préparer la logistique (combinaison, durée, site de repli). Si le score dit "Bonne" et que tu vois 25 kt dans les détails, quelque chose ne va pas — recharge les données.',
    methodAnchor: '#sources',
  },

  waveVsSwell: {
    shows: 'Houle (swell) et mer de vent séparément.',
    helps: 'Les deux s\'additionnent : une houle de 0,8 m venant de l\'ouest plus une mer de vent de 0,5 m créent des conditions bien pires que chaque valeur isolée. La houle est formée loin en Atlantique et traverse la Manche sans s\'atténuer ; elle peut rendre un site impraticable même par vent calme local.',
    methodAnchor: '#limites',
  },

  clubDives: {
    shows: 'Prochaines sorties organisées par le club.',
    helps: 'Une sortie bateau change radicalement le seuil de décision : depuis un bateau, des conditions à 60/100 sont souvent gérables alors qu\'elles seraient rédhibitoires depuis une cale. Vérifier ici si une sortie est organisée avant de te décider sur la météo.',
  },

  equipment: {
    shows: 'État et dates de révision du matériel personnel.',
    helps: 'Un détendeur hors révision ou une bouteille dont le contrôle est périmé = sortie impossible, quelle que soit la météo. À vérifier en amont d\'une sortie planifiée, pas le matin même.',
  },

  diveSites: {
    shows: 'Caractéristiques des sites de plongée locaux : exposition, profondeur, difficulté.',
    helps: 'Permet de croiser les conditions du jour avec l\'exposition réelle du site visé. Un site "exposé ouest" sera impraticable avec une houle de secteur ouest même si le score global est correct. Le modèle météo ne connaît pas la topographie locale.',
    methodAnchor: '#limites',
  },

  units: {
    shows: 'Unités d\'affichage : nœuds ou km/h pour le vent, °C ou °F pour la température.',
    helps: 'Les bulletins météo marins VHF et les cartes officielles Météo-France utilisent les nœuds. Si tu utilises ces sources comme référence croisée, garde les nœuds pour comparer sans conversion.',
  },

};

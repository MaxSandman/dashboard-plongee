import React, { useRef, useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { HelpCircle, ExternalLink } from 'lucide-react';
import { HINTS, type Hint } from '../help/hints';

interface InfoHintProps {
  hintId: string;
  className?: string;
}

const TOOLTIP_WIDTH = 272; // px

const InfoHint: React.FC<InfoHintProps> = ({ hintId, className = '' }) => {
  const hint: Hint | undefined = HINTS[hintId];
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const clickOpened = useRef(false); // si ouvert par clic, le survol ne ferme pas

  const computePos = useCallback(() => {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const top = r.bottom + window.scrollY + 6;
    const idealLeft = r.left + window.scrollX - TOOLTIP_WIDTH / 2 + r.width / 2;
    const left = Math.max(12, Math.min(idealLeft, window.innerWidth - TOOLTIP_WIDTH - 12));
    setPos({ top, left });
  }, []);

  const openTooltip = useCallback(() => {
    clearTimeout(closeTimer.current);
    computePos();
    setOpen(true);
  }, [computePos]);

  const scheduleClose = useCallback((delay: number) => {
    closeTimer.current = setTimeout(() => {
      if (!clickOpened.current) setOpen(false);
    }, delay);
  }, []);

  const handleButtonClick = () => {
    if (open && clickOpened.current) {
      clickOpened.current = false;
      setOpen(false);
    } else {
      clickOpened.current = true;
      openTooltip();
    }
  };

  const handleTooltipMouseEnter = () => clearTimeout(closeTimer.current);
  const handleTooltipMouseLeave = () => {
    if (!clickOpened.current) scheduleClose(150);
  };

  // Touche Échap
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { clickOpened.current = false; setOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Clic en dehors
  useEffect(() => {
    if (!open || !clickOpened.current) return;
    const onOutside = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        clickOpened.current = false;
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  if (!hint) return null;

  const tooltip = open ? ReactDOM.createPortal(
    <div
      ref={tooltipRef}
      onMouseEnter={handleTooltipMouseEnter}
      onMouseLeave={handleTooltipMouseLeave}
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        width: TOOLTIP_WIDTH,
        zIndex: 9999,
      }}
      className="rounded-xl bg-navy-800 border border-navy-600 shadow-2xl p-3 text-xs text-gray-300"
    >
      {/* Ce que la zone montre */}
      <p className="text-gray-500 mb-2 leading-relaxed">{hint.shows}</p>
      {/* La décision — texte principal */}
      <p className="text-gray-200 leading-relaxed mb-1">{hint.helps}</p>
      {/* Comment lire l'affichage (optionnel) */}
      {hint.reading && (
        <p className="text-gray-500 italic leading-relaxed mt-2 pt-2 border-t border-navy-700">{hint.reading}</p>
      )}
      {/* Lien vers la page Méthode */}
      {hint.methodAnchor && (
        <button
          className="mt-2 flex items-center gap-1 text-ocean-400 hover:text-ocean-300 transition-colors"
          onClick={() => {
            // Émet un événement custom que App.tsx capte pour basculer sur l'onglet Méthode
            window.dispatchEvent(new CustomEvent('open-methode', { detail: hint.methodAnchor }));
            clickOpened.current = false;
            setOpen(false);
          }}
        >
          <ExternalLink size={10} />
          <span>Voir dans Méthode</span>
        </button>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <span className={`inline-flex items-center ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Aide : ${hint.shows}`}
        aria-expanded={open}
        className="text-gray-600 hover:text-ocean-400 focus:text-ocean-400 focus:outline-none transition-colors ml-1"
        onMouseEnter={() => { if (!clickOpened.current) openTooltip(); }}
        onMouseLeave={() => { if (!clickOpened.current) scheduleClose(350); }}
        onFocus={() => { if (!clickOpened.current) openTooltip(); }}
        onBlur={() => { if (!clickOpened.current) scheduleClose(200); }}
        onClick={handleButtonClick}
      >
        <HelpCircle size={13} />
      </button>
      {tooltip}
    </span>
  );
};

export default InfoHint;

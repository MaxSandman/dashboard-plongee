import React from 'react';
import InfoHint from './InfoHint';

interface SectionTitleProps {
  icon?: React.ReactNode;
  title: string;
  hintId?: string;
  children?: React.ReactNode; // pour des éléments supplémentaires à droite
}

const SectionTitle: React.FC<SectionTitleProps> = ({ icon, title, hintId, children }) => (
  <div className="card-header">
    {icon}
    <span>{title}</span>
    {hintId && <InfoHint hintId={hintId} />}
    {children}
  </div>
);

export default SectionTitle;

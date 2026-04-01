import React from 'react';
import { FileQuestion } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, actionLabel, onAction, icon }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm glass-panel mx-auto max-w-lg mt-8">
      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500 mb-6">
        {icon || <FileQuestion size={32} />}
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">{description}</p>
      
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="btn btn-primary"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

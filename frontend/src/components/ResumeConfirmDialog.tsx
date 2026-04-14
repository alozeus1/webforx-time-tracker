import React from 'react';
import AccessibleDialog from './AccessibleDialog';

interface ResumeConfirmDialogProps {
    isOpen: boolean;
    taskDescription: string;
    projectName?: string;
    onResume: () => void;
    onSwitchTask: () => void;
    onStop: () => void;
}

const ResumeConfirmDialog: React.FC<ResumeConfirmDialogProps> = ({
    isOpen,
    taskDescription,
    projectName,
    onResume,
    onSwitchTask,
    onStop,
}) => (
    <AccessibleDialog
        isOpen={isOpen}
        onClose={onResume}
        ariaLabel="Timer paused — confirm task"
        panelClassName="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
    >
        <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Timer Paused</p>
            <h2 className="text-xl font-bold text-slate-900">Still working on this?</h2>
            <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-800">{taskDescription}</p>
                {projectName && (
                    <p className="mt-0.5 text-slate-500">{projectName}</p>
                )}
            </div>
            <div className="flex flex-col gap-2">
                <button
                    type="button"
                    className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white text-left"
                    onClick={onResume}
                >
                    Yes, resume this task
                </button>
                <button
                    type="button"
                    className="w-full rounded-md border border-slate-200 px-4 py-2.5 text-sm text-slate-700 text-left"
                    onClick={onSwitchTask}
                >
                    Switch to a different task
                </button>
                <button
                    type="button"
                    className="w-full rounded-md border border-slate-200 px-4 py-2.5 text-sm text-slate-500 text-left"
                    onClick={onStop}
                >
                    Stop for the day
                </button>
            </div>
        </div>
    </AccessibleDialog>
);

export default ResumeConfirmDialog;

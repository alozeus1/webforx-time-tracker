import React, { useEffect, useRef } from 'react';

interface AccessibleDialogProps {
    isOpen: boolean;
    onClose: () => void;
    ariaLabel?: string;
    ariaLabelledBy?: string;
    panelClassName?: string;
    closeOnBackdrop?: boolean;
    children: React.ReactNode;
}

const getFocusableElements = (root: HTMLElement): HTMLElement[] => {
    return Array.from(
        root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
    ).filter((element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'));
};

const AccessibleDialog: React.FC<AccessibleDialogProps> = ({
    isOpen,
    onClose,
    ariaLabel,
    ariaLabelledBy,
    panelClassName,
    closeOnBackdrop = true,
    children,
}) => {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const lastFocusedRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        const bodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusPanel = window.requestAnimationFrame(() => {
            const panel = panelRef.current;
            if (!panel) {
                return;
            }

            const focusableElements = getFocusableElements(panel);
            if (focusableElements.length > 0) {
                focusableElements[0].focus();
                return;
            }

            panel.focus();
        });

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== 'Tab') {
                return;
            }

            const panel = panelRef.current;
            if (!panel) {
                return;
            }

            const focusableElements = getFocusableElements(panel);
            if (focusableElements.length === 0) {
                event.preventDefault();
                panel.focus();
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement as HTMLElement | null;

            if (event.shiftKey) {
                if (!activeElement || activeElement === firstElement || !panel.contains(activeElement)) {
                    event.preventDefault();
                    lastElement.focus();
                }
                return;
            }

            if (!activeElement || activeElement === lastElement || !panel.contains(activeElement)) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => {
            window.cancelAnimationFrame(focusPanel);
            document.body.style.overflow = bodyOverflow;
            document.removeEventListener('keydown', onKeyDown);
            lastFocusedRef.current?.focus?.();
        };
    }, [isOpen, onClose]);

    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (closeOnBackdrop && event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                tabIndex={-1}
                className={panelClassName}
            >
                {children}
            </div>
        </div>
    );
};

export default AccessibleDialog;

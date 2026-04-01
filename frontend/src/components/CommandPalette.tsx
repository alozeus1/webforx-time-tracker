import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Clock, LayoutDashboard, FileText, Settings, Play } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = (command: () => void) => {
    command();
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity" />
        <Dialog.Content className="fixed left-1/2 top-1/4 -translate-x-1/2 z-50 w-full max-w-xl px-4 focus:outline-none">
          <Command label="Global Command Menu" className="w-full">
            <div className="flex items-center px-4 border-b border-slate-200 dark:border-slate-800">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <Command.Input placeholder="Type a command or search..." />
            </div>
            
            <Command.List>
              <Command.Empty className="py-6 text-center text-sm text-slate-500">No results found.</Command.Empty>
              
              <Command.Group heading="Quick Actions" className="py-2 px-2 text-xs font-semibold text-slate-500">
                <Command.Item onSelect={() => runCommand(() => navigate('/timer'))}>
                  <Play className="w-4 h-4 mr-2 text-indigo-500" /> Start Timer
                </Command.Item>
              </Command.Group>

              <Command.Separator className="h-px bg-slate-100 dark:bg-slate-800" />

              <Command.Group heading="Navigation" className="py-2 px-2 text-xs font-semibold text-slate-500">
                <Command.Item onSelect={() => runCommand(() => navigate('/dashboard'))}>
                  <LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard
                </Command.Item>
                <Command.Item onSelect={() => runCommand(() => navigate('/timeline'))}>
                  <Clock className="w-4 h-4 mr-2" /> Timeline
                </Command.Item>
                <Command.Item onSelect={() => runCommand(() => navigate('/reports'))}>
                  <FileText className="w-4 h-4 mr-2" /> Reports
                </Command.Item>
                <Command.Item onSelect={() => runCommand(() => navigate('/settings'))}>
                  <Settings className="w-4 h-4 mr-2" /> Settings
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

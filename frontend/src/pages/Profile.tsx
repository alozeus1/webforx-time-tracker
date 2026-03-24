import React, { useEffect, useState } from 'react';
import api from '../services/api';

interface CurrentUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    is_active: boolean;
}

const Profile: React.FC = () => {
    const [user, setUser] = useState<CurrentUser | null>(null);

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const response = await api.get<CurrentUser>('/users/me');
                setUser(response.data);
            } catch (error) {
                console.error('Failed to load profile:', error);
            }
        };

        void loadProfile();
    }, []);

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-background-dark p-8 w-full">
            <div className="max-w-3xl mx-auto space-y-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Profile</h1>
                    <p className="mt-1 text-slate-500">Read-only account details for the current authenticated user.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">First Name</p>
                            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{user?.first_name || 'Loading...'}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Last Name</p>
                            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{user?.last_name || 'Loading...'}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Email</p>
                            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{user?.email || 'Loading...'}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Role</p>
                            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{user?.role || 'Loading...'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;

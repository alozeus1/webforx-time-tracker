import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { getApiErrorMessage } from '../services/api';
import type { SharedArtifactResponse } from '../types/api';

const SharedArtifact: React.FC = () => {
    const { token } = useParams();
    const [artifact, setArtifact] = useState<SharedArtifactResponse | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const response = await api.get<SharedArtifactResponse>(`/public/share/${token}`);
                setArtifact(response.data);
            } catch (error) {
                setErrorMessage(getApiErrorMessage(error, 'This shared artifact is unavailable or expired.'));
            }
        };

        if (token) {
            void load();
        }
    }, [token]);

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-10">
            <div className="mx-auto max-w-4xl space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Web Forx Trust Share</p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900" style={{ fontFamily: 'var(--font-family-display)' }}>
                        {artifact?.title || 'Shared evidence'}
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        {artifact?.description || 'Review the shared project, invoice, or operations evidence below.'}
                    </p>
                </div>

                {errorMessage && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
                        {errorMessage}
                    </div>
                )}

                {artifact && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{artifact.type}</p>
                            <p className="text-xs text-slate-500">Generated {new Date(artifact.generatedAt).toLocaleString()}</p>
                        </div>
                        <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-5 text-xs leading-6 text-slate-100">
                            {JSON.stringify(artifact.data, null, 2)}
                        </pre>
                    </section>
                )}
            </div>
        </main>
    );
};

export default SharedArtifact;

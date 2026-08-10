import React, { useCallback, useEffect, useState } from 'react';
import { LocateFixed, MapPin, Plus, Trash2 } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import type { GeofencePolicySummary, GeofenceZoneSummary } from '../types/api';
import { useFeedback } from '../hooks/useFeedback';

const Geofencing: React.FC = () => {
    const { confirm } = useFeedback();
    const [policy, setPolicy] = useState<GeofencePolicySummary>({ enabled: false, enforce_on_clock_in: true, max_accuracy_meters: 500 });
    const [zones, setZones] = useState<GeofenceZoneSummary[]>([]);
    const [form, setForm] = useState({ name: '', rule_type: 'allow' as 'allow' | 'deny', latitude: '', longitude: '', radius_meters: '250' });
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

    const load = useCallback(async () => {
        try {
            const [policyResponse, zonesResponse] = await Promise.all([
                api.get<{ policy: GeofencePolicySummary }>('/geofences/policy'),
                api.get<{ zones: GeofenceZoneSummary[] }>('/geofences/zones'),
            ]);
            setPolicy(policyResponse.data.policy);
            setZones(zonesResponse.data.zones || []);
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to load geofencing settings') });
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const savePolicy = async () => {
        setSaving(true);
        try {
            const response = await api.put<{ policy: GeofencePolicySummary }>('/geofences/policy', policy);
            setPolicy(response.data.policy);
            setFeedback({ tone: 'success', message: response.data.policy.enabled ? 'Clock-in geofencing enabled.' : 'Clock-in geofencing disabled.' });
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to save geofence policy') });
        } finally { setSaving(false); }
    };

    const addZone = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            await api.post('/geofences/zones', { ...form, latitude: Number(form.latitude), longitude: Number(form.longitude), radius_meters: Number(form.radius_meters) });
            setForm({ name: '', rule_type: 'allow', latitude: '', longitude: '', radius_meters: '250' });
            await load();
            setFeedback({ tone: 'success', message: 'Geofence zone created. Review it before enabling enforcement.' });
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to create geofence zone') });
        } finally { setSaving(false); }
    };

    const useCurrentLocation = () => {
        if (!navigator.geolocation) { setFeedback({ tone: 'error', message: 'Geolocation is not available on this device.' }); return; }
        navigator.geolocation.getCurrentPosition(
            (position) => setForm((current) => ({ ...current, latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6) })),
            () => setFeedback({ tone: 'error', message: 'Allow location access to use the current position.' }),
            { enableHighAccuracy: true, timeout: 12_000 },
        );
    };

    const removeZone = async (zoneId: string) => {
        if (!await confirm({ message: 'Delete this geofence zone?', destructive: true, confirmLabel: 'Delete zone' })) return;
        try { await api.delete(`/geofences/zones/${zoneId}`); await load(); }
        catch (error) { setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to delete geofence zone') }); }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950 lg:p-8">
            <div className="mx-auto max-w-5xl space-y-6">
                <div><div className="flex items-center gap-2"><MapPin className="text-primary" /><h1 className="text-3xl font-black text-slate-900 dark:text-white">Clock-in Geofencing</h1></div><p className="mt-2 max-w-3xl text-sm text-slate-500">Configure physical location boundaries. Browser time zones are not used as proof of location because users and devices can change them.</p></div>
                {feedback && <div className={`rounded-xl px-4 py-3 text-sm font-medium ${feedback.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{feedback.message}</div>}

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">Enforcement policy</h2>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicy((current) => ({ ...current, enabled: event.target.checked }))} /> Enable geofencing</label>
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={policy.enforce_on_clock_in} onChange={(event) => setPolicy((current) => ({ ...current, enforce_on_clock_in: event.target.checked }))} /> Enforce on clock-in</label>
                        <label className="text-xs font-bold uppercase text-slate-500">Maximum GPS uncertainty (meters)<input type="number" min="25" max="5000" value={policy.max_accuracy_meters} onChange={(event) => setPolicy((current) => ({ ...current, max_accuracy_meters: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800" /></label>
                    </div>
                    <div className="mt-4 flex items-center gap-3"><button disabled={saving} onClick={() => void savePolicy()} type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">Save policy</button><span className="text-xs text-slate-500">Disabled by default. At least one active zone is required before enabling.</span></div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-900 dark:text-white">Geographic zones</h2><p className="text-xs text-slate-500">Allow zones define approved clock-in areas. Deny zones override allow zones.</p></div></div>
                    <form onSubmit={addZone} className="mt-5 grid gap-3 md:grid-cols-6">
                        <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Office name" className="rounded-lg border border-slate-200 px-3 py-2 md:col-span-2" />
                        <select value={form.rule_type} onChange={(event) => setForm((current) => ({ ...current, rule_type: event.target.value as 'allow' | 'deny' }))} className="rounded-lg border border-slate-200 px-3 py-2"><option value="allow">Allow</option><option value="deny">Deny</option></select>
                        <input required type="number" step="0.000001" min="-90" max="90" value={form.latitude} onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))} placeholder="Latitude" className="rounded-lg border border-slate-200 px-3 py-2" />
                        <input required type="number" step="0.000001" min="-180" max="180" value={form.longitude} onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))} placeholder="Longitude" className="rounded-lg border border-slate-200 px-3 py-2" />
                        <input required type="number" min="25" max="100000" value={form.radius_meters} onChange={(event) => setForm((current) => ({ ...current, radius_meters: event.target.value }))} placeholder="Radius meters" className="rounded-lg border border-slate-200 px-3 py-2" />
                        <div className="flex gap-2 md:col-span-6"><button type="button" onClick={useCurrentLocation} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700"><LocateFixed size={16} /> Use current location</button><button disabled={saving} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"><Plus size={16} /> Add zone</button></div>
                    </form>
                    <div className="mt-6 space-y-3">{zones.map((zone) => <div key={zone.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"><div><p className="font-semibold text-slate-900 dark:text-white">{zone.name} <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${zone.rule_type === 'allow' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{zone.rule_type}</span></p><p className="mt-1 text-xs text-slate-500">{zone.latitude.toFixed(6)}, {zone.longitude.toFixed(6)} · {zone.radius_meters.toLocaleString()} m radius</p></div><button type="button" onClick={() => void removeZone(zone.id)} className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${zone.name}`}><Trash2 size={16} /></button></div>)}{zones.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No geofence zones configured.</p>}</div>
                </section>
            </div>
        </div>
    );
};

export default Geofencing;

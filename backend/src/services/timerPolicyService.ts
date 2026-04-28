import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { env } from '../config/env';

export type TimerPolicy = {
    heartbeatIntervalSeconds: number;
    missedHeartbeatWarningThreshold: number;
    missedHeartbeatPauseThreshold: number;
    idleWarningAfterMinutes: number;
    idlePauseAfterMinutes: number;
    maxSessionDurationHours: number;
    allowResumeAfterIdlePause: boolean;
    requireNoteOnResumeAfterMinutes: number;
};

export const DEFAULT_TIMER_POLICY: TimerPolicy = {
    heartbeatIntervalSeconds: env.heartbeatIntervalMinutes * 60,
    missedHeartbeatWarningThreshold: Number.parseInt(process.env.MISSED_HEARTBEAT_WARNING_THRESHOLD || '', 10) || 3,
    missedHeartbeatPauseThreshold: Number.parseInt(process.env.MISSED_HEARTBEAT_PAUSE_THRESHOLD || '', 10) || 4,
    idleWarningAfterMinutes: env.idleWarningMinutes,
    idlePauseAfterMinutes: Math.min(Math.max(env.heartbeatStaleMinutes + env.autoStopGraceMinutes, 5), 60),
    maxSessionDurationHours: env.maxActiveTimerHours,
    allowResumeAfterIdlePause: true,
    requireNoteOnResumeAfterMinutes: 30,
};

const toNumber = (value: unknown, fallback: number) => {
    if (typeof value === 'number') return value;
    if (value instanceof Prisma.Decimal) return value.toNumber();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeTimerPolicy = (config?: Partial<TimerPolicy> | null): TimerPolicy => ({
    heartbeatIntervalSeconds: Math.round(toNumber(config?.heartbeatIntervalSeconds, DEFAULT_TIMER_POLICY.heartbeatIntervalSeconds)),
    missedHeartbeatWarningThreshold: Math.round(toNumber(config?.missedHeartbeatWarningThreshold, DEFAULT_TIMER_POLICY.missedHeartbeatWarningThreshold)),
    missedHeartbeatPauseThreshold: Math.round(toNumber(config?.missedHeartbeatPauseThreshold, DEFAULT_TIMER_POLICY.missedHeartbeatPauseThreshold)),
    idleWarningAfterMinutes: Math.round(toNumber(config?.idleWarningAfterMinutes, DEFAULT_TIMER_POLICY.idleWarningAfterMinutes)),
    idlePauseAfterMinutes: Math.round(toNumber(config?.idlePauseAfterMinutes, DEFAULT_TIMER_POLICY.idlePauseAfterMinutes)),
    maxSessionDurationHours: toNumber(config?.maxSessionDurationHours, DEFAULT_TIMER_POLICY.maxSessionDurationHours),
    allowResumeAfterIdlePause: config?.allowResumeAfterIdlePause ?? DEFAULT_TIMER_POLICY.allowResumeAfterIdlePause,
    requireNoteOnResumeAfterMinutes: Math.round(toNumber(config?.requireNoteOnResumeAfterMinutes, DEFAULT_TIMER_POLICY.requireNoteOnResumeAfterMinutes)),
});

export const validateTimerPolicy = (policy: TimerPolicy): string[] => {
    const errors: string[] = [];

    if (policy.heartbeatIntervalSeconds < 60 || policy.heartbeatIntervalSeconds > 900) {
        errors.push('Heartbeat interval must be between 60 and 900 seconds.');
    }
    if (policy.missedHeartbeatWarningThreshold < 2 || policy.missedHeartbeatWarningThreshold > 10) {
        errors.push('Missed heartbeat warning threshold must be between 2 and 10.');
    }
    if (policy.missedHeartbeatPauseThreshold < policy.missedHeartbeatWarningThreshold) {
        errors.push('Missed heartbeat pause threshold must be greater than or equal to warning threshold.');
    }
    if (policy.missedHeartbeatPauseThreshold > 20) {
        errors.push('Missed heartbeat pause threshold cannot exceed 20.');
    }
    if (policy.idleWarningAfterMinutes < 3 || policy.idleWarningAfterMinutes > 55) {
        errors.push('Idle warning must be between 3 and 55 minutes.');
    }
    if (policy.idlePauseAfterMinutes < 5 || policy.idlePauseAfterMinutes > 60) {
        errors.push('Idle pause must be between 5 and 60 minutes.');
    }
    if (policy.idlePauseAfterMinutes < policy.idleWarningAfterMinutes) {
        errors.push('Idle pause must be greater than or equal to idle warning.');
    }
    if (policy.maxSessionDurationHours <= 0 || policy.maxSessionDurationHours > 8) {
        errors.push('Max session duration must be greater than 0 and cannot exceed 8 hours.');
    }
    if (policy.requireNoteOnResumeAfterMinutes < 0 || policy.requireNoteOnResumeAfterMinutes > 480) {
        errors.push('Resume note threshold must be between 0 and 480 minutes.');
    }

    return errors;
};

export const getGlobalTimerPolicy = async (): Promise<TimerPolicy> => {
    const config = await prisma.timerPolicyConfig.findFirst({
        where: { scope_type: 'GLOBAL', scope_id: null },
        orderBy: { updated_at: 'desc' },
    });

    if (!config) return DEFAULT_TIMER_POLICY;

    return normalizeTimerPolicy({
        heartbeatIntervalSeconds: config.heartbeat_interval_seconds,
        missedHeartbeatWarningThreshold: config.missed_heartbeat_warning_threshold,
        missedHeartbeatPauseThreshold: config.missed_heartbeat_pause_threshold,
        idleWarningAfterMinutes: config.idle_warning_after_minutes,
        idlePauseAfterMinutes: config.idle_pause_after_minutes,
        maxSessionDurationHours: config.max_session_duration_hours.toNumber(),
        allowResumeAfterIdlePause: config.allow_resume_after_idle_pause,
        requireNoteOnResumeAfterMinutes: config.require_note_on_resume_after_minutes,
    });
};

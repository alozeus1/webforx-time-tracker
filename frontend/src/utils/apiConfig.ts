type BrowserLocationLike = {
    protocol?: string;
    hostname?: string;
};

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

export const inferLocalApiOrigin = (locationLike?: BrowserLocationLike) => {
    const protocol = locationLike?.protocol || 'http:';
    const hostname = locationLike?.hostname || 'localhost';

    return `${protocol}//${hostname}:5005`;
};

export const resolveApiBaseUrl = (
    configuredUrl?: string,
    locationLike?: BrowserLocationLike,
) => {
    const trimmed = configuredUrl?.trim();
    if (trimmed) {
        return trimTrailingSlashes(trimmed);
    }

    return `${inferLocalApiOrigin(locationLike)}/api/v1`;
};

export const resolveApiOrigin = (
    configuredUrl?: string,
    locationLike?: BrowserLocationLike,
) => {
    const baseUrl = resolveApiBaseUrl(configuredUrl, locationLike);
    return trimTrailingSlashes(baseUrl.replace(/\/api\/v1$/i, ''));
};

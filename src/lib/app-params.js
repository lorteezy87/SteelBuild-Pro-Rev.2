const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getParamFromCurrentUrl = (paramName) => {
	if (isNode) {
		return null;
	}

	const searchParams = new URLSearchParams(window.location.search);
	const fromSearch = searchParams.get(paramName);
	if (fromSearch) {
		return { value: fromSearch, source: 'search', params: searchParams };
	}

	const hash = window.location.hash?.startsWith('#')
		? window.location.hash.slice(1)
		: window.location.hash;
	const hashParams = new URLSearchParams(hash);
	const fromHash = hashParams.get(paramName);
	if (fromHash) {
		return { value: fromHash, source: 'hash', params: hashParams };
	}

	return null;
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const paramFromUrl = getParamFromCurrentUrl(paramName);
	if (removeFromUrl && paramFromUrl) {
		paramFromUrl.params.delete(paramName);
		const nextSearch = paramFromUrl.source === 'search'
			? paramFromUrl.params.toString()
			: window.location.search.slice(1);
		const nextHash = paramFromUrl.source === 'hash'
			? paramFromUrl.params.toString()
			: window.location.hash.slice(1);
		const newUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""
			}${nextHash ? `#${nextHash}` : ""}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (paramFromUrl?.value) {
		storage.setItem(storageKey, paramFromUrl.value);
		return paramFromUrl.value;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

const getAppParams = () => {
	if (getAppParamValue("clear_access_token") === 'true') {
		storage.removeItem('base44_access_token');
		storage.removeItem('token');
	}
	return {
		appId: getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_BASE44_APP_ID || '69c601dad306a58eba6696b2' }),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: window.location.href }),
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
		appBaseUrl: getAppParamValue("app_base_url", { defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL || 'https://steelbuild-pro-ba6696b2.base44.app' }),
	}
}


export const appParams = {
	...getAppParams()
}

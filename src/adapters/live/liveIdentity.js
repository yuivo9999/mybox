function clean(value){return String(value??'').trim().toLocaleLowerCase();}
export function resolveCanonicalChannelId({canonicalId='',channelKey='',name='' }={}){const canonical=clean(canonicalId);if(canonical)return canonical;const key=clean(channelKey);if(key)return key;return '';}
export function createSourceChannelIdentity(sourceId,sourceItemId){return `source-channel:${clean(sourceId)}:${clean(sourceItemId)}`;}
export function createFallbackChannelIdentity({sourceId,sourceItemId}){return `source:${clean(sourceId)}:${clean(sourceItemId)}`;}
export function createCanonicalChannelIdentity(canonicalId){return canonicalId?`canonical:${clean(canonicalId)}`:'';}
export function createDisplayNameKey(name){return clean(name).replace(/\s+/g,' ');}

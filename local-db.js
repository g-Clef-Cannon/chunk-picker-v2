(function() {
    const clone = function(value) {
        if (value === undefined || value === null) {
            return null;
        }
        return JSON.parse(JSON.stringify(value));
    };

    const normalizePath = function(path) {
        return (path || '').toString().replace(/^\/+|\/+$/g, '');
    };

    const pathUrl = function(path) {
        const cleanPath = normalizePath(path);
        const encodedPath = cleanPath ? '/' + cleanPath.split('/').map(encodeURIComponent).join('/') : '';
        return '/localdb' + encodedPath + '.json';
    };

    class LocalSnapshot {
        constructor(value) {
            this.value = clone(value);
        }

        val() {
            return clone(this.value);
        }

        exists() {
            return this.value !== null;
        }
    }

    class LocalRef {
        constructor(path) {
            this.path = normalizePath(path);
        }

        child(childPath) {
            childPath = normalizePath(childPath);
            return new LocalRef([this.path, childPath].filter(Boolean).join('/'));
        }

        once(eventName, callback) {
            if (eventName !== 'value') {
                return Promise.reject(new Error('Local DB only supports value events.'));
            }
            return fetch(pathUrl(this.path), { cache: 'no-store' })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('Local DB read failed for ' + this.path + ': HTTP ' + response.status);
                    }
                    return response.json();
                })
                .then((value) => {
                    const snap = new LocalSnapshot(value);
                    if (callback) {
                        callback(snap);
                    }
                    return snap;
                });
        }

        on(eventName, callback) {
            this.once(eventName, callback);
            return callback;
        }

        set(value, callback) {
            return fetch(pathUrl(this.path), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(value === undefined ? null : value)
            }).then((response) => {
                if (!response.ok) {
                    throw new Error('Local DB write failed for ' + this.path + ': HTTP ' + response.status);
                }
                if (callback) {
                    callback(null);
                }
                return response.json();
            }).catch((error) => {
                if (callback) {
                    callback(error);
                }
                throw error;
            });
        }

        update(value, callback) {
            return fetch(pathUrl(this.path), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(value || {})
            }).then((response) => {
                if (!response.ok) {
                    throw new Error('Local DB update failed for ' + this.path + ': HTTP ' + response.status);
                }
                if (callback) {
                    callback(null);
                }
                return response.json();
            }).catch((error) => {
                if (callback) {
                    callback(error);
                }
                throw error;
            });
        }

        remove(callback) {
            return this.set(null, callback);
        }

        push(value, callback) {
            return fetch(pathUrl(this.path), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(value === undefined ? null : value)
            }).then((response) => {
                if (!response.ok) {
                    throw new Error('Local DB push failed for ' + this.path + ': HTTP ' + response.status);
                }
                if (callback) {
                    callback(null);
                }
                return response.json();
            }).catch((error) => {
                if (callback) {
                    callback(error);
                }
                throw error;
            });
        }
    }

    window.LocalFirebaseDatabase = {
        ref: function(path) {
            return new LocalRef(path);
        }
    };
})();

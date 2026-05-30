const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const rootDir = __dirname;
const port = parseInt(process.env.PORT || '3000', 10);
const dbDir = process.env.CHUNK_PICKER_LOCAL_DB_DIR || path.join(rootDir, '.local-db');
const dbFile = path.join(dbDir, 'db.json');
const backupDir = path.join(dbDir, 'backups');
let latestBackupPath = null;

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

const defaultDb = function() {
    return {
        mapids: {},
        maps: {},
        underMaintenance: false,
        versionEnforced: false
    };
};

const timestampForFile = function(date = new Date()) {
    const pad = function(value, size = 2) {
        return value.toString().padStart(size, '0');
    };
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('') + '-' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join('') + '-' + pad(date.getMilliseconds(), 3);
};

const safeReason = function(reason) {
    return (reason || 'manual')
        .toString()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'manual';
};

const safeJsonStringify = function(value) {
    return JSON.stringify(value, null, 2) + '\n';
};

const ensureDirs = function() {
    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });
};

const atomicWriteJson = function(file, value) {
    ensureDirs();
    const tempFile = file + '.' + process.pid + '.' + Date.now() + '.tmp';
    let fd = null;
    try {
        fd = fs.openSync(tempFile, 'w');
        fs.writeFileSync(fd, safeJsonStringify(value), 'utf8');
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = null;
        fs.renameSync(tempFile, file);
    } catch (error) {
        if (fd !== null) {
            try {
                fs.closeSync(fd);
            } catch (closeError) {
                console.error('Failed closing temp DB file after write error:', closeError);
            }
        }
        if (fs.existsSync(tempFile)) {
            fs.rmSync(tempFile, { force: true });
        }
        throw error;
    }
};

const ensureDb = function() {
    ensureDirs();
    if (!fs.existsSync(dbFile)) {
        atomicWriteJson(dbFile, defaultDb());
    }
};

const getBackupFiles = function() {
    ensureDirs();
    return fs.readdirSync(backupDir)
        .filter((file) => /^db-\d{8}-\d{6}-\d{3}-.+\.json$/.test(file))
        .map((file) => path.join(backupDir, file))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
};

const uniqueBackupPath = function(reason) {
    let backupPath = path.join(backupDir, 'db-' + timestampForFile() + '-' + safeReason(reason) + '.json');
    let count = 1;
    while (fs.existsSync(backupPath)) {
        backupPath = path.join(backupDir, 'db-' + timestampForFile() + '-' + safeReason(reason) + '-' + count + '.json');
        count++;
    }
    return backupPath;
};

const createBackup = function(reason) {
    ensureDirs();
    if (!fs.existsSync(dbFile)) {
        return null;
    }
    const backupPath = uniqueBackupPath(reason);
    fs.copyFileSync(dbFile, backupPath, fs.constants.COPYFILE_EXCL);
    latestBackupPath = backupPath;
    return backupPath;
};

const recoverLatestBackup = function(parseError) {
    const backups = getBackupFiles();
    for (const backupPath of backups) {
        try {
            const backupJson = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            if (fs.existsSync(dbFile)) {
                const corruptPath = path.join(backupDir, 'db-corrupt-' + timestampForFile() + '.json');
                fs.copyFileSync(dbFile, corruptPath);
                console.error('Saved unreadable local DB to ' + corruptPath);
            }
            fs.copyFileSync(backupPath, dbFile);
            latestBackupPath = backupPath;
            console.error('Recovered local DB from backup ' + backupPath + ' after parse error: ' + parseError.message);
            return backupJson;
        } catch (backupError) {
            console.error('Skipping unreadable local DB backup ' + backupPath + ': ' + backupError.message);
        }
    }
    throw new Error('Local DB is unreadable and no valid backup exists. Original parse error: ' + parseError.message);
};

const readDb = function() {
    ensureDb();
    try {
        return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch (error) {
        return recoverLatestBackup(error);
    }
};

const writeDb = function(db, reason) {
    ensureDb();
    createBackup(reason || 'before-write');
    atomicWriteJson(dbFile, db);
};

const clone = function(value) {
    if (value === undefined || value === null) {
        return null;
    }
    return JSON.parse(JSON.stringify(value));
};

const pathParts = function(dbPath) {
    return dbPath.split('/').filter(Boolean);
};

const getAt = function(db, dbPath) {
    let current = db;
    for (const part of pathParts(dbPath)) {
        if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
            return null;
        }
        current = current[part];
    }
    return clone(current);
};

const setAt = function(db, dbPath, value) {
    const parts = pathParts(dbPath);
    if (parts.length === 0) {
        return value && typeof value === 'object' ? value : {};
    }
    let current = db;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
        }
        current = current[parts[i]];
    }
    if (value === null) {
        delete current[parts[parts.length - 1]];
    } else {
        current[parts[parts.length - 1]] = value;
    }
    return db;
};

const patchAt = function(db, dbPath, patch) {
    const existing = getAt(db, dbPath);
    const next = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
    Object.keys(patch || {}).forEach((key) => {
        if (patch[key] === null) {
            delete next[key];
        } else {
            next[key] = patch[key];
        }
    });
    return setAt(db, dbPath, next);
};

const readBody = function(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 25 * 1024 * 1024) {
                reject(new Error('Request body too large.'));
                req.destroy();
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
};

const sendJson = function(res, status, value) {
    const body = JSON.stringify(value === undefined ? null : value);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(body);
};

const sendText = function(res, status, value, contentType) {
    res.writeHead(status, {
        'Content-Type': contentType || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(value);
};

const localDbModeOverride = function() {
    const value = process.env.CHUNK_PICKER_LOCAL_DB_MODE;
    if (value === undefined) {
        return null;
    }
    return ['1', 'true', 'yes', 'on'].includes(value.toString().trim().toLowerCase());
};

const localModeScript = function() {
    const override = localDbModeOverride();
    if (override !== null) {
        return `window.CHUNK_PICKER_LOCAL_DB = ${override};\n`;
    }
    return fs.readFileSync(path.join(rootDir, 'local-mode.js'), 'utf8');
};

const getLatestBackupPath = function() {
    const backups = getBackupFiles();
    return backups.length > 0 ? backups[0] : null;
};

const localDbPathFromUrl = function(pathname) {
    let dbPath = pathname.replace(/^\/localdb\/?/, '');
    dbPath = dbPath.replace(/\.json$/, '');
    return dbPath.split('/').filter(Boolean).map(decodeURIComponent).join('/');
};

const handleLocalDb = async function(req, res, pathname) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    const dbPath = localDbPathFromUrl(pathname);
    if (req.method === 'GET') {
        sendJson(res, 200, getAt(readDb(), dbPath));
        return;
    }
    const rawBody = await readBody(req);
    const value = rawBody ? JSON.parse(rawBody) : null;
    if (req.method === 'PUT') {
        const db = readDb();
        writeDb(setAt(db, dbPath, value), 'put-' + (dbPath || 'root'));
        sendJson(res, 200, value);
        return;
    }
    if (req.method === 'PATCH') {
        const db = readDb();
        writeDb(patchAt(db, dbPath, value), 'patch-' + (dbPath || 'root'));
        sendJson(res, 200, getAt(readDb(), dbPath));
        return;
    }
    if (req.method === 'POST') {
        const db = readDb();
        const key = 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        const existing = getAt(db, dbPath);
        const next = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
        next[key] = value;
        writeDb(setAt(db, dbPath, next), 'post-' + (dbPath || 'root'));
        sendJson(res, 200, { name: key });
        return;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
};

const serveStatic = function(req, res, pathname) {
    let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    relativePath = decodeURIComponent(relativePath);
    let filePath = path.resolve(rootDir, relativePath);
    if (!filePath.startsWith(rootDir + path.sep) && filePath !== rootDir) {
        sendText(res, 403, 'Forbidden');
        return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (error, data) => {
        if (error) {
            sendText(res, 404, 'Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(data);
    });
};

const dbExistedAtStartup = fs.existsSync(dbFile);
ensureDb();
readDb();
if (dbExistedAtStartup) {
    const startupBackup = createBackup('startup');
    console.log('Startup local DB backup: ' + startupBackup);
}

http.createServer(async (req, res) => {
    try {
        const requestUrl = new URL(req.url, 'http://localhost');
        if (requestUrl.pathname === '/local-mode.js') {
            sendText(res, 200, localModeScript(), 'application/javascript; charset=utf-8');
            return;
        }
        if (requestUrl.pathname === '/localdb/health.json') {
            sendJson(res, 200, { ok: true, dbFile, backupDir, latestBackup: latestBackupPath || getLatestBackupPath() });
            return;
        }
        if (requestUrl.pathname === '/localdb/export.json' && req.method === 'GET') {
            sendJson(res, 200, readDb());
            return;
        }
        if (requestUrl.pathname === '/localdb/backup.json' && req.method === 'POST') {
            const backupPath = createBackup('manual');
            sendJson(res, 200, { ok: true, backupPath });
            return;
        }
        if (requestUrl.pathname.startsWith('/localdb')) {
            await handleLocalDb(req, res, requestUrl.pathname);
            return;
        }
        serveStatic(req, res, requestUrl.pathname);
    } catch (error) {
        console.error(error);
        sendJson(res, 500, { error: error.message });
    }
}).listen(port, () => {
    console.log('Chunk Picker local DB server listening on http://localhost:' + port);
    console.log('Local database: ' + dbFile);
});

/**
 * Detect recoverable idle / server-closed client disconnects from node-pg pools.
 * These are expected when the DB or network drops an idle connection; the pool
 * recreates clients on the next query.
 */
function isRecoverableIdleDisconnect(err) {
  const code = err && err.code;
  if (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === '57P01' || // admin_shutdown
    code === '57P02' || // crash_shutdown
    code === '57P03' // cannot_connect_now
  ) {
    return true;
  }
  const msg = String((err && err.message) || '');
  return (
    /terminat/i.test(msg) ||
    /ECONNRESET/i.test(msg) ||
    /connection (?:ended|terminated) unexpectedly/i.test(msg) ||
    /server closed the connection/i.test(msg)
  );
}

/**
 * Attach a pool `error` listener: recoverable idle disconnects → warn once;
 * everything else → error.
 * @param {import('pg').Pool} pool
 * @param {string} label — e.g. "db" or "siga-db"
 */
function attachPoolErrorHandler(pool, label) {
  let idleWarned = false;
  pool.on('error', (err) => {
    if (isRecoverableIdleDisconnect(err)) {
      if (!idleWarned) {
        idleWarned = true;
        console.warn(
          `[${label}] idle client disconnected (recoverable; further events suppressed): ${err.message}`
        );
      }
      return;
    }
    console.error(`[${label}] unexpected pool error`, err.message);
  });
}

module.exports = { isRecoverableIdleDisconnect, attachPoolErrorHandler };

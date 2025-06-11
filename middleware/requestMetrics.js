/**
 * Extract device OS from user agent string
 * @param {string} userAgent - User agent string
 * @returns {string} - Detected OS name
 */
function extractDeviceOS(userAgent) {
  if (!userAgent) return 'unknown';
  
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
  if (/macintosh|mac os x/i.test(userAgent)) return 'MacOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  
  return 'Other';
}

/**
 * Creates a middleware to track request metrics with device OS and environment type tags
 * @param {function} logFunction - The log function to use for logging metrics
 * @returns {function} - The middleware function
 */
function createRequestMetricsMiddleware(logFunction) {
  return function requestMetricsMiddleware(req, res, next) {
    const startTime = process.hrtime();
    const userAgent = req.get('User-Agent');
    const deviceOS = extractDeviceOS(userAgent);
    const envType = process.env.ENV_TYPE || '0';
    
    // Store device OS and start time as request properties
    req.deviceOS = deviceOS;
    req.requestStartTime = startTime;
    
    // Track response metrics
    res.on('finish', () => {
      const diff = process.hrtime(startTime);
      const responseTime = Math.round((diff[0] * 1e3) + (diff[1] * 1e-6)); // in ms
      
      // Use the provided log function or fall back to console.log
      if (typeof logFunction === 'function') {
        logFunction('info', 'Request metrics', {
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
          responseTime,
          tags: {
            device_os: deviceOS,
            env_type: envType
          }
        });
      } else {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Request metrics',
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
          responseTime,
          tags: {
            device_os: deviceOS,
            env_type: envType
          }
        }));
      }
    });
    
    next();
  };
}

module.exports = createRequestMetricsMiddleware;
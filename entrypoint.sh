#!/bin/bash
set -e

# Railway automatically provides RAILWAY_STATIC_URL or custom domain env vars.
# If available, we set Cobalt's API_URL so it constructs valid links.
if [ ! -z "$RAILWAY_STATIC_URL" ]; then
    export API_URL="https://${RAILWAY_STATIC_URL}/cobalt-api"
elif [ ! -z "$RAILWAY_PUBLIC_DOMAIN" ]; then
    export API_URL="https://${RAILWAY_PUBLIC_DOMAIN}/cobalt-api"
else
    # Fallback to localhost if running locally
    export API_URL="http://localhost/cobalt-api"
fi

# Ensure default site is enabled
a2ensite 000-default.conf > /dev/null 2>&1

# Use Railway's injected PORT environment variable if available
if [ -n "$PORT" ]; then
    echo "Running on dynamic port: $PORT"
    sed -i "s/80/$PORT/g" /etc/apache2/sites-available/000-default.conf /etc/apache2/ports.conf
fi

# Initialize rl tracking for api.php rate limiter
touch /tmp/rl.json
chmod 777 /tmp/rl.json

# Start supervisor which will start both Apache and Cobalt API
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
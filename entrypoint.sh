#!/bin/bash
set -e

# Railway automatically provides RAILWAY_STATIC_URL or custom domain env vars.
# If available, we set Cobalt's API_URL so it constructs valid links.
if [ ! -z "$RAILWAY_STATIC_URL" ]; then
    export API_URL="https://${RAILWAY_STATIC_URL}/cobalt-api/"
elif [ ! -z "$RAILWAY_PUBLIC_DOMAIN" ]; then
    export API_URL="https://${RAILWAY_PUBLIC_DOMAIN}/cobalt-api/"
else
    # Fallback to localhost if running locally
    export API_URL="http://localhost/cobalt-api/"
fi

# Ensure Cobalt listens on all interfaces inside the container
export API_LISTEN_ADDRESS="0.0.0.0"
export API_PORT="9001"

# Force disable conflicting MPMs and ensure prefork is uniquely loaded
rm -f /etc/apache2/mods-enabled/mpm_*.load /etc/apache2/mods-enabled/mpm_*.conf
a2enmod mpm_prefork > /dev/null 2>&1 || true

# Ensure default site is enabled
a2ensite 000-default.conf > /dev/null 2>&1

# Use Railway's injected PORT environment variable if available
if [ -n "$PORT" ]; then
    echo "Running on dynamic port: $PORT"

    # Configure Apache to listen on common Railway target ports plus runtime PORT.
    # This avoids 502s when domain target-port setting is out of sync.
    {
        echo "Listen 0.0.0.0:80"
        echo "Listen [::]:80"
        echo "Listen 0.0.0.0:3000"
        echo "Listen [::]:3000"

        if [ "$PORT" != "80" ] && [ "$PORT" != "3000" ]; then
            echo "Listen 0.0.0.0:$PORT"
            echo "Listen [::]:$PORT"
        fi
        cat <<'EOF'

<IfModule ssl_module>
        Listen 443
</IfModule>

<IfModule mod_gnutls.c>
        Listen 443
</IfModule>
EOF
    } > /etc/apache2/ports.conf

    # Accept requests from 80, 3000 and runtime PORT on the same vhost.
    if [ "$PORT" = "80" ] || [ "$PORT" = "3000" ]; then
        sed -E -i "s#<VirtualHost[^>]+>#<VirtualHost *:80 *:3000>#" /etc/apache2/sites-available/000-default.conf
    else
        sed -E -i "s#<VirtualHost[^>]+>#<VirtualHost *:80 *:3000 *:$PORT>#" /etc/apache2/sites-available/000-default.conf
    fi
fi

# Initialize rl tracking for api.php rate limiter
touch /tmp/rl.json
chmod 777 /tmp/rl.json

# Start supervisor which will start both Apache and Cobalt API
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
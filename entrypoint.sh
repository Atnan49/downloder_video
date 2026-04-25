#!/bin/bash
set -e

# Proactively update yt-dlp to handle newest YouTube changes
python3 -m pip install -U yt-dlp 2>/dev/null || true

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

# Start supervisor which will start Apache
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
#!/bin/bash
# Autonomous Yield Oracle - Service Manager
# Built by Turbinete 🚀

PLIST_NAME="com.turbinete.yield-oracle"
PLIST_SRC="$(dirname "$0")/com.turbinete.yield-oracle.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$(dirname "$0")/logs"

case "$1" in
    install)
        echo "📦 Installing Autonomous Yield Oracle service..."
        mkdir -p "$HOME/Library/LaunchAgents"
        mkdir -p "$LOG_DIR"
        cp "$PLIST_SRC" "$PLIST_DEST"
        echo "✅ Service installed: $PLIST_DEST"
        echo "   Run './service.sh start' to begin"
        ;;
    
    uninstall)
        echo "🗑️ Uninstalling service..."
        launchctl unload "$PLIST_DEST" 2>/dev/null
        rm -f "$PLIST_DEST"
        echo "✅ Service uninstalled"
        ;;
    
    start)
        echo "🚀 Starting Autonomous Yield Oracle..."
        mkdir -p "$LOG_DIR"
        launchctl load "$PLIST_DEST"
        echo "✅ Service started"
        echo "   Logs: $LOG_DIR/"
        ;;
    
    stop)
        echo "🛑 Stopping service..."
        launchctl unload "$PLIST_DEST"
        echo "✅ Service stopped"
        ;;
    
    restart)
        echo "🔄 Restarting service..."
        launchctl unload "$PLIST_DEST" 2>/dev/null
        sleep 2
        launchctl load "$PLIST_DEST"
        echo "✅ Service restarted"
        ;;
    
    status)
        echo "📊 Service Status:"
        if launchctl list | grep -q "$PLIST_NAME"; then
            echo "   Status: ✅ Running"
            launchctl list "$PLIST_NAME" 2>/dev/null
        else
            echo "   Status: ❌ Not running"
        fi
        echo ""
        echo "📁 Recent logs:"
        if [ -f "$LOG_DIR/launchd-stdout.log" ]; then
            tail -10 "$LOG_DIR/launchd-stdout.log"
        else
            echo "   No logs yet"
        fi
        ;;
    
    logs)
        echo "📋 Following logs (Ctrl+C to exit)..."
        tail -f "$LOG_DIR"/*.log
        ;;
    
    run)
        echo "🚀 Running in foreground (Ctrl+C to stop)..."
        cd "$(dirname "$0")"
        npm run loop
        ;;
    
    *)
        echo "Autonomous Yield Oracle - Service Manager"
        echo ""
        echo "Usage: $0 {install|uninstall|start|stop|restart|status|logs|run}"
        echo ""
        echo "Commands:"
        echo "  install   - Install as launchd service (auto-start on boot)"
        echo "  uninstall - Remove launchd service"
        echo "  start     - Start the service"
        echo "  stop      - Stop the service"
        echo "  restart   - Restart the service"
        echo "  status    - Show service status and recent logs"
        echo "  logs      - Follow logs in real-time"
        echo "  run       - Run in foreground (for testing)"
        exit 1
        ;;
esac

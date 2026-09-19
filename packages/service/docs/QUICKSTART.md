# Quick Start Guide

Get up and running with Arduino WebSocket Service in 5 minutes!

## Prerequisites Check

Before starting, ensure you have:

- ✅ Node.js 16.x or higher installed
- ✅ npm package manager
- ✅ Arduino CLI installed (optional for testing)

## Installation

```bash
# Clone or navigate to the project
cd arduino-websocket-service

# Install dependencies
npm install

# Copy environment example
copy .env.example .env  # Windows
# or
cp .env.example .env    # Linux/macOS
```

## Start the Service

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

You should see:

```
[INFO] Arduino WebSocket Service started on port 3000
[INFO] Health check available at: http://localhost:3000/health
[INFO] WebSocket endpoint: ws://localhost:3000
```

## Verify It's Running

Open a browser and visit: `http://localhost:3000`

You should see:

```json
{
  "name": "Arduino WebSocket Service",
  "version": "1.0.0",
  "description": "WebSocket service for compiling and uploading Arduino projects"
}
```

## Test with wscat

```bash
# Install wscat globally
npm install -g wscat

# Connect to the service
wscat -c ws://localhost:3000

# List connected boards
> {"action": "list-boards", "payload": {}}
```

## Test with HTML Client

1. Open `docs/TEST_CLIENT.md`
2. Copy the HTML code to a file `test.html`
3. Open `test.html` in your browser
4. Click "Connect"
5. Try "List Boards" action

## Your First Compilation

1. Create a simple Arduino sketch:

```cpp
// MySketch.ino
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}
```

2. Send compile request via wscat:

```json
{
  "action": "compile",
  "payload": {
    "sketchPath": "C:\\path\\to\\MySketch",
    "board": "arduino:avr:uno"
  }
}
```

3. Watch real-time output!

## Common Issues

### "Arduino CLI not available"

**Solution**: Install Arduino CLI

```bash
# Windows (Chocolatey)
choco install arduino-cli

# macOS (Homebrew)
brew install arduino-cli

# Linux
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh

# Then initialize
arduino-cli core update-index
arduino-cli core install arduino:avr
```

### "Port already in use"

**Solution**: Change port in `.env`

```env
PORT=3001
```

### "Connection refused"

**Solution**: Make sure service is running

```bash
npm run dev
```

## Next Steps

- 📖 Read the full [README](../README.md)
- 🔌 Check [API Documentation](./API.md)
- 🧪 Try [Example Sketches](./EXAMPLE_SKETCHES.md)
- 🚀 Deploy with [Docker](../Dockerfile)

## Need Help?

- Check health endpoint: `http://localhost:3000/health`
- Review logs in the terminal
- Open an issue on GitHub

Happy coding! 🎉


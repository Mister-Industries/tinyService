## Example WebSocket Client Test

You can use this simple HTML file to test the WebSocket service in a browser.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Arduino WebSocket Test Client</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }
      .container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      .panel {
        border: 1px solid #ccc;
        padding: 15px;
        border-radius: 5px;
      }
      textarea {
        width: 100%;
        height: 200px;
        font-family: monospace;
        margin-bottom: 10px;
      }
      button {
        padding: 10px 20px;
        margin: 5px;
        cursor: pointer;
      }
      .connected {
        background-color: #4caf50;
        color: white;
      }
      .disconnected {
        background-color: #f44336;
        color: white;
      }
      #output {
        background-color: #f5f5f5;
        padding: 10px;
        height: 400px;
        overflow-y: auto;
        font-family: monospace;
        font-size: 12px;
      }
      .message {
        margin: 5px 0;
        padding: 5px;
        border-left: 3px solid #ccc;
      }
      .status {
        border-left-color: #2196f3;
      }
      .output {
        border-left-color: #ff9800;
      }
      .error {
        border-left-color: #f44336;
        background-color: #ffebee;
      }
      .complete {
        border-left-color: #4caf50;
        background-color: #e8f5e9;
      }
    </style>
  </head>
  <body>
    <h1>Arduino WebSocket Test Client</h1>

    <div style="margin-bottom: 20px;">
      <button id="connectBtn" onclick="connect()">Connect</button>
      <button id="disconnectBtn" onclick="disconnect()" disabled>
        Disconnect
      </button>
      <span id="status" class="disconnected">Disconnected</span>
    </div>

    <div class="container">
      <div class="panel">
        <h3>Send Message</h3>
        <textarea id="messageInput">
{
  "action": "list-boards",
  "payload": {}
}</textarea
        >
        <button onclick="sendMessage()">Send</button>
        <button onclick="clearInput()">Clear</button>

        <h4>Quick Actions:</h4>
        <button onclick="setMessage('list-boards')">List Boards</button>
        <button onclick="setMessage('compile')">Compile</button>
        <button onclick="setMessage('upload')">Upload</button>
        <button onclick="setMessage('verify')">Verify</button>
      </div>

      <div class="panel">
        <h3>Output</h3>
        <button onclick="clearOutput()">Clear Output</button>
        <div id="output"></div>
      </div>
    </div>

    <script>
      let ws = null;

      function connect() {
        ws = new WebSocket("ws://localhost:3000");

        ws.onopen = () => {
          updateStatus(true);
          addOutput("Connected to Arduino WebSocket Service", "status");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            addOutput(JSON.stringify(data, null, 2), data.type);
          } catch (e) {
            addOutput(event.data, "output");
          }
        };

        ws.onerror = (error) => {
          addOutput("WebSocket error: " + error, "error");
        };

        ws.onclose = () => {
          updateStatus(false);
          addOutput("Disconnected from server", "status");
        };
      }

      function disconnect() {
        if (ws) {
          ws.close();
          ws = null;
        }
      }

      function sendMessage() {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          alert("Not connected to server");
          return;
        }

        const message = document.getElementById("messageInput").value;
        try {
          JSON.parse(message); // Validate JSON
          ws.send(message);
          addOutput("Sent: " + message, "status");
        } catch (e) {
          alert("Invalid JSON: " + e.message);
        }
      }

      function setMessage(action) {
        const templates = {
          "list-boards": {
            action: "list-boards",
            payload: {},
          },
          compile: {
            action: "compile",
            payload: {
              sketchPath: "C:\\\\path\\\\to\\\\sketch.ino",
              board: "arduino:avr:uno",
            },
          },
          upload: {
            action: "upload",
            payload: {
              sketchPath: "C:\\\\path\\\\to\\\\sketch.ino",
              board: "arduino:avr:uno",
              port: "COM3",
            },
          },
          verify: {
            action: "verify",
            payload: {
              sketchPath: "C:\\\\path\\\\to\\\\sketch.ino",
              board: "arduino:avr:uno",
            },
          },
        };

        document.getElementById("messageInput").value = JSON.stringify(
          templates[action],
          null,
          2
        );
      }

      function clearInput() {
        document.getElementById("messageInput").value = "";
      }

      function clearOutput() {
        document.getElementById("output").innerHTML = "";
      }

      function addOutput(text, type) {
        const output = document.getElementById("output");
        const div = document.createElement("div");
        div.className = "message " + type;
        div.textContent = new Date().toLocaleTimeString() + " - " + text;
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
      }

      function updateStatus(connected) {
        const status = document.getElementById("status");
        const connectBtn = document.getElementById("connectBtn");
        const disconnectBtn = document.getElementById("disconnectBtn");

        if (connected) {
          status.textContent = "Connected";
          status.className = "connected";
          connectBtn.disabled = true;
          disconnectBtn.disabled = false;
        } else {
          status.textContent = "Disconnected";
          status.className = "disconnected";
          connectBtn.disabled = false;
          disconnectBtn.disabled = true;
        }
      }
    </script>
  </body>
</html>
```

Save this as `test-client.html` and open it in a browser to test the WebSocket service.


# Example Arduino Sketch for Testing

Here's a simple Arduino sketch you can use to test the compilation service.

## Blink.ino

```cpp
// Blink LED example
// This sketch blinks the built-in LED

void setup() {
  // Initialize digital pin LED_BUILTIN as an output
  pinMode(LED_BUILTIN, OUTPUT);

  // Start serial communication
  Serial.begin(9600);
  Serial.println("Blink sketch started!");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);   // Turn the LED on
  Serial.println("LED ON");
  delay(1000);                       // Wait for a second

  digitalWrite(LED_BUILTIN, LOW);    // Turn the LED off
  Serial.println("LED OFF");
  delay(1000);                       // Wait for a second
}
```

## Testing Steps

1. Save the above code as `Blink.ino` in a folder named `Blink`
2. Connect to the WebSocket service
3. Send a compile request:

```json
{
  "action": "compile",
  "payload": {
    "sketchPath": "C:\\path\\to\\Blink",
    "board": "arduino:avr:uno"
  }
}
```

Note: On Windows, use double backslashes in paths or forward slashes.

## More Complex Example

```cpp
// Temperature Monitor with Serial Output
#define TEMP_PIN A0

void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  // Read temperature from analog pin
  int sensorValue = analogRead(TEMP_PIN);

  // Convert to voltage (0-5V range)
  float voltage = sensorValue * (5.0 / 1023.0);

  // Convert to temperature (assuming TMP36 sensor)
  float temperatureC = (voltage - 0.5) * 100.0;

  // Print to serial
  Serial.print("Temperature: ");
  Serial.print(temperatureC);
  Serial.println(" C");

  // Blink LED based on temperature
  if (temperatureC > 25.0) {
    digitalWrite(LED_BUILTIN, HIGH);
  } else {
    digitalWrite(LED_BUILTIN, LOW);
  }

  delay(2000);  // Wait 2 seconds
}
```


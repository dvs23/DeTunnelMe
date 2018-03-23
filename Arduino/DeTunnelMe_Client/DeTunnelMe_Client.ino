#include <VirtualWire.h>

#define USERNAME "frank"

void setup() {
  Serial.begin(19200);
  Serial.println("OK");
  Serial.println(VW_MAX_MESSAGE_LEN);

  pinMode(10, OUTPUT);
  digitalWrite(10, LOW);
  pinMode(8, OUTPUT);
  digitalWrite(8, LOW);
  pinMode(12, OUTPUT);
  digitalWrite(12, LOW);

  vw_setup(1000);       // Bits pro Sekunde
  vw_set_rx_pin(5);     // Datenleitung
  vw_rx_start();        // Empfänger starten
}

void loop() {
  uint8_t buf[VW_MAX_MESSAGE_LEN];
  uint8_t buflen = VW_MAX_MESSAGE_LEN;
  if (vw_get_message(buf, &buflen)) { // überprüfen ob eine Nachricht eingegangen ist
    String str = "";
    for (int i = 0; i < buflen; i++) {
      str += (char)buf[i];
    }
    Serial.println("OK"+str);
    if (str.length() > 3) {
      const String ende = str.substring(str.length() - 3, str.length());
      const String uname = str.substring(0, str.length() - 3);
      Serial.println(str + " " + ende + " " + uname);
      if (ende == "END" && uname == USERNAME) {
        for (int i = 0; i < 10; i++) {
          digitalWrite(8, HIGH);
          delay(50);
          digitalWrite(8, LOW);
          digitalWrite(10, HIGH);
          delay(50);
          digitalWrite(10, LOW);
          digitalWrite(12, HIGH);
          delay(50);
          digitalWrite(12, LOW);
        }
      }
    }
  }
}

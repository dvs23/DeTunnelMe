#include <VirtualWire.h>

void setup() {
  Serial.begin(19200);
  Serial.println("OK");
  Serial.println(VW_MAX_MESSAGE_LEN);

  pinMode(8, OUTPUT);
  digitalWrite(8, LOW);

  vw_setup(1000);       // Bits pro Sekunde
  vw_set_rx_pin(5);     // Datenleitung
  vw_set_tx_pin(6);
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
      if (ende == "END") {
        digitalWrite(8, HIGH);
        for (int i = 0; i < 10; i++) {
          vw_send((uint8_t *)str.c_str(), strlen(str.c_str()));
          vw_wait_tx();
        }
        digitalWrite(8, LOW);
      }
    }
  }
}

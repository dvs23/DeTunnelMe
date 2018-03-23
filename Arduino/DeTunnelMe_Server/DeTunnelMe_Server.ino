#include <Wire.h>
#include <VirtualWire.h>
#include <QueueList.h>

#define SLAVE_ADDRESS 0x04
int number = 0;
int state = 0;

QueueList<String> coms;

void setup() {
  Serial.begin(9600); // start serial for output
  // initialize i2c as slave
  Wire.begin(SLAVE_ADDRESS);

  // define callbacks for i2c communication
  Wire.onReceive(receiveData);
  Wire.onRequest(sendData);

  vw_setup(1000);       // Bits pro Sekunde
  vw_set_tx_pin(6);     // Datenleitung

  Serial.println("Ready!");
}

void loop() {
  if (!coms.isEmpty()) {
    String req = coms.pop()+"END";
    Serial.println(req);
    for (int i = 0; i < 15; i++) { //send 15 times to make sure the data really arrives...
      vw_send((uint8_t *)req.c_str(), strlen(req.c_str()));
      vw_wait_tx();
    }
  }
  delay(100);
}

String req = "";
// callback for received data
void receiveData(int byteCount) {
  while (Wire.available()) {
    number = Wire.read();
    req += (char)number;
  }
  if (req.length() > 0 && req[req.length() - 1] == '%'){
    coms.push(req.substring(0, req.length()-1));//cut off .
    req = "";
  }    
}

// callback for sending data
void sendData() {
  Wire.write(number);
}

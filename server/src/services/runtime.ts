// Simple runtime holder to expose service instances across modules
let whatsappManager: any = null;

export function setWhatsAppManager(manager: any) {
  whatsappManager = manager;
}

export function getWhatsAppManager(): any {
  return whatsappManager;
}

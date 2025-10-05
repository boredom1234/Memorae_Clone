// Simple runtime holder to expose service instances across modules
let whatsappManager: any = null;
let telegramManager: any = null;

export function setWhatsAppManager(manager: any) {
  whatsappManager = manager;
}

export function getWhatsAppManager(): any {
  return whatsappManager;
}

export function setTelegramManager(manager: any) {
  telegramManager = manager;
}

export function getTelegramManager(): any {
  return telegramManager;
}

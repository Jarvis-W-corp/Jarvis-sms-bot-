import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '';
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '';

let initialized = false;

export async function initPurchases(userId?: string) {
  if (initialized) return;

  const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
  if (!apiKey) {
    console.warn('RevenueCat API key not configured — subscriptions will run in demo mode');
    return;
  }

  await Purchases.configure({ apiKey, appUserID: userId });
  initialized = true;
}

export async function getOfferings(): Promise<PurchasesPackage[]> {
  if (!initialized) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return [];
    return current.availablePackages;
  } catch (err) {
    console.warn('Failed to get offerings:', err);
    return [];
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (err: any) {
    if (err.userCancelled) return null;
    throw err;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!initialized) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

export function getTierFromEntitlements(info: CustomerInfo | null): 'free' | 'plus' | 'pro' {
  if (!info) return 'free';
  if (info.entitlements.active['pro']) return 'pro';
  if (info.entitlements.active['plus']) return 'plus';
  return 'free';
}

export async function identifyUser(userId: string) {
  if (!initialized) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.warn('RevenueCat identify failed:', err);
  }
}

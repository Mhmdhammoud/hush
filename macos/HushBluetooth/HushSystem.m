#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(HushSystem, RCTEventEmitter)
RCT_EXTERN_METHOD(launchAtLogin:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setLaunchAtLogin:(BOOL)on resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(notify:(NSString *)title body:(NSString *)body)
RCT_EXTERN_METHOD(setMenuState:(NSString *)state)
RCT_EXTERN_METHOD(quit)
RCT_EXTERN_METHOD(haptic)
RCT_EXTERN_METHOD(publishState:(NSString *)json)
RCT_EXTERN_METHOD(micInUse:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getPref:(NSString *)key resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setPref:(NSString *)key value:(NSString *)value)
@end

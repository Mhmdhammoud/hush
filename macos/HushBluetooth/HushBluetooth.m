#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(HushBluetooth, RCTEventEmitter)
RCT_EXTERN_METHOD(connect:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(send:(NSString *)hex)
RCT_EXTERN_METHOD(disconnect)
RCT_EXTERN_METHOD(pullHeadset:(NSString *)address resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end

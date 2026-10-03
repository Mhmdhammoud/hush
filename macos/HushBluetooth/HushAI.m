#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HushAI, NSObject)
RCT_EXTERN_METHOD(available:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(interpret:(NSString *)text state:(NSString *)state resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HushCalendar, NSObject)
RCT_EXTERN_METHOD(authorizationStatus:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestAccess:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(upcomingMeetings:(double)withinMinutes resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end

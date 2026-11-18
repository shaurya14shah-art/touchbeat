import {FilesetResolver,PoseLandmarker,ObjectDetector} from '../vendor/vision_bundle.mjs';
async function make(Task,opts){
  try{return await Task.createFromOptions(window.__vision,{...opts,baseOptions:{...opts.baseOptions,delegate:'GPU'}});}
  catch{return Task.createFromOptions(window.__vision,{...opts,baseOptions:{...opts.baseOptions,delegate:'CPU'}});}
}
export async function createTracker(){
  window.__vision=await FilesetResolver.forVisionTasks('./vendor/wasm');
  const pose=await make(PoseLandmarker,{baseOptions:{modelAssetPath:'./models/pose_landmarker_full.task'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.4,minTrackingConfidence:.4});
  const det=await make(ObjectDetector,{baseOptions:{modelAssetPath:'./models/efficientdet_lite0.tflite'},runningMode:'VIDEO',scoreThreshold:.12,categoryAllowlist:['sports ball'],maxResults:3});
  let lastMs=0,n=0,balls=[];
  return{
    detect(video,ms){
      ms=Math.max(Math.round(ms),lastMs+1);lastMs=ms;
      const r=pose.detectForVideo(video,ms);
      // The ball moves slowly relative to the body, so it can be sampled less often to protect frame rate.
      if(n++%2===0){const w=video.videoWidth,h=video.videoHeight;
        balls=det.detectForVideo(video,ms+0).detections.map(d=>[(d.boundingBox.originX+d.boundingBox.width/2)/w,(d.boundingBox.originY+d.boundingBox.height/2)/h,d.boundingBox.width/w,d.boundingBox.height/h,d.categories[0].score]);}
      return{landmarks:r.landmarks?.[0]||null,balls};
    }
  };
}

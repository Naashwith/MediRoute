package com.mediroute.signal;
import org.springframework.stereotype.Service; import org.springframework.messaging.simp.SimpMessagingTemplate; import java.time.Instant; import java.util.*; import java.util.concurrent.*;
@Service public class SignalPriorityService {
 private final SimpMessagingTemplate ws; private final ConcurrentMap<String,SignalState> states=new ConcurrentHashMap<>();
 public record SignalState(String signalId,String color,boolean priorityActive,String emergencyId,Instant updatedAt) {}
 public SignalPriorityService(SimpMessagingTemplate ws){this.ws=ws;}
 public SignalState requestPriority(String signalId,String emergencyId,int durationSeconds){if(durationSeconds<1||durationSeconds>120)throw new IllegalArgumentException("durationSeconds must be 1..120"); SignalState s=new SignalState(signalId,"GREEN",true,emergencyId,Instant.now());states.put(signalId,s);ws.convertAndSend("/topic/signals/"+signalId,s);CompletableFuture.delayedExecutor(durationSeconds,TimeUnit.SECONDS).execute(()->{SignalState normal=new SignalState(signalId,"NORMAL",false,null,Instant.now());states.put(signalId,normal);ws.convertAndSend("/topic/signals/"+signalId,normal);});return s;}
 public Collection<SignalState> list(){return states.values();}
}

package com.mediroute.service;
import com.mediroute.route.RouteCandidate; import org.springframework.beans.factory.annotation.Value; import org.springframework.stereotype.Service; import org.springframework.web.client.RestClient; import java.util.*;
@Service public class RouteService {
@Value("${mediroute.osrm-url:https://router.project-osrm.org}") String osrm;
@Value("${mediroute.valhalla-url:https://valhalla1.openstreetmap.de}") String valhalla;
private final RestClient http=RestClient.create();
public List<RouteCandidate> alternatives(double fromLat,double fromLon,double toLat,double toLon){
 List<RouteCandidate> out=new ArrayList<>(); try {String u=osrm+"/route/v1/driving/"+fromLon+","+fromLat+";"+toLon+","+toLat+"?alternatives=3&overview=full&geometries=geojson"; Map m=http.get().uri(u).retrieve().body(Map.class); List<Map> routes=(List<Map>)m.get("routes"); for(Map r:routes){Map geo=(Map)r.get("geometry"); List<List<Double>> coords=(List<List<Double>>)geo.get("coordinates"); double km=((Number)r.get("distance")).doubleValue()/1000, mins=((Number)r.get("duration")).doubleValue()/60; out.add(new RouteCandidate("OSRM",km,mins,mins+(km*.15),false,coords));} } catch(Exception ignored){}
 try {Map body=Map.of("locations",List.of(Map.of("lat",fromLat,"lon",fromLon),Map.of("lat",toLat,"lon",toLon)),"costing","auto","directions_options",Map.of("units","kilometers"),"alternates",2); Map m=http.post().uri(valhalla+"/route").body(body).retrieve().body(Map.class); Map trip=(Map)m.get("trip"); List<Map> legs=(List<Map>)trip.get("legs"); double km=0; List<List<Double>> coords=new ArrayList<>(); for(Map leg:legs){Map summary=(Map)leg.get("summary");km+=((Number)summary.get("length")).doubleValue();} double mins=((Number)((Map)trip.get("summary")).get("time")).doubleValue()/60; out.add(new RouteCandidate("Valhalla",km,mins,mins+km*.15,false,coords)); } catch(Exception ignored){}
 if(out.isEmpty()){double km=new com.mediroute.entity.GeoPoint(fromLat,fromLon).distanceKm(new com.mediroute.entity.GeoPoint(toLat,toLon))*1.35;out.add(new RouteCandidate("Fallback estimate",km,km*2,km*2+km*.15,false,List.of()));}
 double best=out.stream().mapToDouble(RouteCandidate::score).min().orElse(0); List<RouteCandidate> ranked=new ArrayList<>(); for(RouteCandidate r:out) ranked.add(new RouteCandidate(r.provider(),r.distanceKm(),r.durationMinutes(),r.score(),r.score()==best,r.geometry())); return ranked;
}
}

package com.mediroute.route; import java.util.*; public record RouteCandidate(String provider,double distanceKm,double durationMinutes,double score,boolean selected,List<List<Double>> geometry) {}

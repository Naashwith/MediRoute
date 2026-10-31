package com.mediroute.entity;
public record GeoPoint(double lat,double lon) { public double distanceKm(GeoPoint p){double r=6371,dLat=Math.toRadians(p.lat-lat),dLon=Math.toRadians(p.lon-lon); double a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(Math.toRadians(lat))*Math.cos(Math.toRadians(p.lat))*Math.sin(dLon/2)*Math.sin(dLon/2);return 2*r*Math.asin(Math.sqrt(a));} }

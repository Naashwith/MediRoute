package com.mediroute.entity;
import jakarta.persistence.*;
@Entity @Table(name="ambulances") public class Ambulance {
@Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
@Column(nullable=false,unique=true) private String unitCode;
private String crewName;
@Enumerated(EnumType.STRING) private Status status=Status.AVAILABLE;
private Double latitude,longitude;
public enum Status { AVAILABLE, ASSIGNED, OFFLINE }
protected Ambulance(){} public Ambulance(String unitCode,String crewName,double lat,double lon){this.unitCode=unitCode;this.crewName=crewName;this.latitude=lat;this.longitude=lon;}
public Long getId(){return id;} public String getUnitCode(){return unitCode;} public String getCrewName(){return crewName;} public Status getStatus(){return status;} public Double getLatitude(){return latitude;} public Double getLongitude(){return longitude;} public void assign(){status=Status.ASSIGNED;} public void release(){status=Status.AVAILABLE;} public void updateLocation(double lat,double lon){latitude=lat;longitude=lon;} public void goOffline(){status=Status.OFFLINE;} public void reportCrewLocation(double lat,double lon){latitude=lat;longitude=lon;if(status==Status.OFFLINE)status=Status.AVAILABLE;}
}

package com.mediroute.entity;
import jakarta.persistence.*; import java.time.*; import java.util.*;
@Entity @Table(name="emergencies") public class Emergency {
@Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
private String patientName,contact,status,symptoms,requiredCapability,category,description;
private double pickupLat,pickupLon; private LocalDateTime createdAt=LocalDateTime.now(),updatedAt=LocalDateTime.now();
@ManyToOne private Ambulance ambulance; @ManyToOne private Hospital hospital;
protected Emergency(){} public Emergency(String patientName,String contact,double lat,double lon){this.patientName=patientName;this.contact=contact;pickupLat=lat;pickupLon=lon;status="REQUESTED";}
public Long getId(){return id;} public String getPatientName(){return patientName;} public String getContact(){return contact;} public String getStatus(){return status;} public Ambulance getAmbulance(){return ambulance;} public Hospital getHospital(){return hospital;} public double getPickupLat(){return pickupLat;} public double getPickupLon(){return pickupLon;} public String getSymptoms(){return symptoms;} public String getRequiredCapability(){return requiredCapability;} public String getCategory(){return category;} public String getDescription(){return description;} public LocalDateTime getCreatedAt(){return createdAt;} public LocalDateTime getUpdatedAt(){return updatedAt;}
public void setDetails(String category,String description){this.category=category;this.description=description;}
public void assign(Ambulance a){ambulance=a;status="ASSIGNED";} public void assess(String s,String c){symptoms=s;requiredCapability=c;status="ASSESSED";} public void selectHospital(Hospital h){hospital=h;status="HOSPITAL_SELECTED";}
public void updateStatus(String next){status=next;updatedAt=LocalDateTime.now();}
@PreUpdate public void touch(){updatedAt=LocalDateTime.now();}
}

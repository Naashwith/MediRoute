package com.mediroute.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "hospitals")
public class Hospital {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;
    @Column(nullable = false, length = 1000)
    private String address;
    private double latitude;
    private double longitude;
    private int capacity;
    private int availableBeds;
    private int occupiedBeds;
    private int reservedBeds;
    private int icuBeds;
    private int emergencyBeds;
    private int traumaBeds;
    private int isolationBeds;
    private String license;
    private String contactName;
    private String designation;
    private String phone;
    private String email;
    private String emergencyPhone;
    @Column(length = 4000)
    private String doctorDetails;
    @Column(length = 2000)
    private String otherEquipment;
    @Column(length = 500)
    private String rareBloodGroups;
    private boolean active = true;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "hospital_capabilities", joinColumns = @JoinColumn(name = "hospital_id"))
    @Column(name = "capability")
    private Set<String> capabilities = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "hospital_specialties", joinColumns = @JoinColumn(name = "hospital_id"))
    @Column(name = "specialty")
    private Set<String> specialties = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "hospital_equipment", joinColumns = @JoinColumn(name = "hospital_id"))
    @Column(name = "equipment")
    private Set<String> equipment = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "hospital_blood_groups", joinColumns = @JoinColumn(name = "hospital_id"))
    @Column(name = "blood_group")
    private Set<String> bloodGroups = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "hospital_services", joinColumns = @JoinColumn(name = "hospital_id"))
    @Column(name = "service_name")
    private Set<String> services = new HashSet<>();

    protected Hospital() { }

    public Hospital(String name, String address, double latitude, double longitude,
                    int capacity, int availableBeds, Set<String> capabilities) {
        this.name = name;
        this.address = address;
        this.latitude = latitude;
        this.longitude = longitude;
        this.capacity = capacity;
        this.availableBeds = availableBeds;
        this.capabilities = copy(capabilities);
    }

    public void updateProfile(ProfileData data) {
        name = data.name();
        address = data.address();
        latitude = data.latitude();
        longitude = data.longitude();
        capacity = data.totalBeds();
        availableBeds = data.availableBeds();
        occupiedBeds = data.occupiedBeds();
        reservedBeds = data.reservedBeds();
        icuBeds = data.icuBeds();
        emergencyBeds = data.emergencyBeds();
        traumaBeds = data.traumaBeds();
        isolationBeds = data.isolationBeds();
        license = data.license();
        contactName = data.contactName();
        designation = data.designation();
        phone = data.phone();
        email = data.email();
        emergencyPhone = data.emergencyPhone();
        doctorDetails = data.doctorDetails();
        otherEquipment = data.otherEquipment();
        rareBloodGroups = data.rareBloodGroups();
        specialties = copy(data.specialties());
        equipment = copy(data.equipment());
        bloodGroups = copy(data.bloodGroups());
        services = copy(data.services());
        capabilities = copy(data.capabilities());
    }

    private static Set<String> copy(Set<String> values) {
        return values == null ? new HashSet<>() : new HashSet<>(values);
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getAddress() { return address; }
    public double getLatitude() { return latitude; }
    public double getLongitude() { return longitude; }
    public int getCapacity() { return capacity; }
    public int getAvailableBeds() { return availableBeds; }
    public int getOccupiedBeds() { return occupiedBeds; }
    public int getReservedBeds() { return reservedBeds; }
    public int getIcuBeds() { return icuBeds; }
    public int getEmergencyBeds() { return emergencyBeds; }
    public int getTraumaBeds() { return traumaBeds; }
    public int getIsolationBeds() { return isolationBeds; }
    public String getLicense() { return license; }
    public String getContactName() { return contactName; }
    public String getDesignation() { return designation; }
    public String getPhone() { return phone; }
    public String getEmail() { return email; }
    public String getEmergencyPhone() { return emergencyPhone; }
    public String getDoctorDetails() { return doctorDetails; }
    public String getOtherEquipment() { return otherEquipment; }
    public String getRareBloodGroups() { return rareBloodGroups; }
    public Set<String> getCapabilities() { return capabilities; }
    public Set<String> getSpecialties() { return specialties; }
    public Set<String> getEquipment() { return equipment; }
    public Set<String> getBloodGroups() { return bloodGroups; }
    public Set<String> getServices() { return services; }
    public boolean isActive() { return active; }
    public void setAvailableBeds(int availableBeds) { this.availableBeds = availableBeds; }

    public record ProfileData(String name, String address, double latitude, double longitude,
                              int totalBeds, int availableBeds, int occupiedBeds, int reservedBeds,
                              int icuBeds, int emergencyBeds, int traumaBeds, int isolationBeds,
                              String license, String contactName, String designation, String phone,
                              String email, String emergencyPhone, String doctorDetails,
                              String otherEquipment, String rareBloodGroups, Set<String> specialties,
                              Set<String> equipment, Set<String> bloodGroups, Set<String> services,
                              Set<String> capabilities) { }
}

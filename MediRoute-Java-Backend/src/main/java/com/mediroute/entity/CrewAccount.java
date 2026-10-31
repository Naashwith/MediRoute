package com.mediroute.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "crew_accounts")
public class CrewAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String crewId;

    @Column(nullable = false, unique = true, length = 190)
    private String email;

    @Column(nullable = false, length = 120)
    private String fullName;

    @Column(nullable = false, length = 24)
    private String phone;

    @Column(nullable = false, length = 60)
    private String unitCode;

    @Column(nullable = false, length = 50)
    private String role;

    @Column(nullable = false, length = 64)
    private String passwordHash;

    @Column(nullable = false, length = 32)
    private String passwordSalt;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected CrewAccount() { }

    public CrewAccount(String crewId, String email, String fullName, String phone,
                       String unitCode, String role, String passwordHash, String passwordSalt) {
        this.crewId = crewId;
        this.email = email;
        this.fullName = fullName;
        this.phone = phone;
        this.unitCode = unitCode;
        this.role = role;
        this.passwordHash = passwordHash;
        this.passwordSalt = passwordSalt;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getCrewId() { return crewId; }
    public String getEmail() { return email; }
    public String getFullName() { return fullName; }
    public String getPhone() { return phone; }
    public String getUnitCode() { return unitCode; }
    public String getRole() { return role; }
    public String getPasswordHash() { return passwordHash; }
    public String getPasswordSalt() { return passwordSalt; }
    public Instant getCreatedAt() { return createdAt; }
}

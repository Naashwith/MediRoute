package com.mediroute.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

@Entity
@Table(name = "hospital_accounts", uniqueConstraints = {
        @UniqueConstraint(name = "uk_hospital_account_username", columnNames = "username"),
        @UniqueConstraint(name = "uk_hospital_account_email", columnNames = "email"),
        @UniqueConstraint(name = "uk_hospital_account_hospital", columnNames = "hospital_id")
})
public class HospitalAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 60)
    private String username;
    @Column(nullable = false, length = 190)
    private String email;
    @Column(name = "hospital_id", nullable = false)
    private Long hospitalId;
    @Column(nullable = false, length = 64)
    private String passwordHash;
    @Column(nullable = false, length = 32)
    private String passwordSalt;
    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected HospitalAccount() { }

    public HospitalAccount(String username, String email, Long hospitalId,
                          String passwordHash, String passwordSalt) {
        this.username = username;
        this.email = email;
        this.hospitalId = hospitalId;
        this.passwordHash = passwordHash;
        this.passwordSalt = passwordSalt;
    }

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public Long getHospitalId() { return hospitalId; }
    public String getPasswordHash() { return passwordHash; }
    public String getPasswordSalt() { return passwordSalt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setEmail(String email) { this.email = email; }
}

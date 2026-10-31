package com.mediroute.service;

import com.mediroute.entity.Hospital;
import com.mediroute.entity.HospitalAccount;
import com.mediroute.repository.HospitalAccountRepository;
import com.mediroute.repository.HospitalRepository;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class HospitalAuthService {
    private static final int SALT_BYTES = 16;
    private static final int ITERATIONS = 120_000;
    private static final int KEY_BITS = 256;

    private final HospitalAccountRepository accounts;
    private final HospitalRepository hospitals;
    private final SecureRandom random = new SecureRandom();
    private final ConcurrentMap<String, Long> sessions = new ConcurrentHashMap<>();

    public HospitalAuthService(HospitalAccountRepository accounts, HospitalRepository hospitals) {
        this.accounts = accounts;
        this.hospitals = hospitals;
    }

    @Transactional
    public Session register(String username, String password, Hospital.ProfileData data) {
        String cleanUsername = normalize(username);
        String email = normalize(data.email());
        validate(data);
        if (accounts.existsByUsernameIgnoreCase(cleanUsername)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That hospital username is already registered.");
        }
        if (accounts.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That hospital email is already registered.");
        }

        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        String saltText = Base64.getEncoder().encodeToString(salt);
        String passwordHash = hashPassword(password, salt);

        Hospital hospital = new Hospital(data.name(), data.address(), data.latitude(), data.longitude(),
                data.totalBeds(), data.availableBeds(), data.capabilities());
        hospital.updateProfile(data);
        Hospital savedHospital = hospitals.save(hospital);
        accounts.save(new HospitalAccount(cleanUsername, email, savedHospital.getId(), passwordHash, saltText));
        return createSession(savedHospital);
    }

    @Transactional(readOnly = true)
    public Session login(String identifier, String password) {
        String normalized = normalize(identifier);
        HospitalAccount account = accounts.findByUsernameIgnoreCaseOrEmailIgnoreCase(normalized, normalized)
                .orElseThrow(HospitalAuthService::invalidCredentials);
        byte[] salt = Base64.getDecoder().decode(account.getPasswordSalt());
        byte[] expected = Base64.getDecoder().decode(account.getPasswordHash());
        byte[] actual = Base64.getDecoder().decode(hashPassword(password, salt));
        if (!MessageDigest.isEqual(expected, actual)) throw invalidCredentials();
        Hospital hospital = hospitals.findById(account.getHospitalId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hospital profile not found."));
        return createSession(hospital);
    }

    @Transactional(readOnly = true)
    public Hospital current(String token) {
        Long hospitalId = sessions.get(requireToken(token));
        return hospitals.findById(hospitalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hospital profile not found."));
    }

    @Transactional
    public Hospital update(String token, Hospital.ProfileData data) {
        Long hospitalId = sessions.get(requireToken(token));
        validate(data);
        HospitalAccount account = accounts.findByHospitalId(hospitalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please sign in again."));

        String newEmail = normalize(data.email());
        accounts.findByEmailIgnoreCase(newEmail).ifPresent(existing -> {
            if (!existing.getId().equals(account.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "That hospital email is already registered.");
            }
        });
        account.setEmail(newEmail);
        Hospital hospital = hospitals.findById(hospitalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hospital profile not found."));
        hospital.updateProfile(data);
        return hospitals.save(hospital);
    }

    public void logout(String token) {
        if (token != null && !token.isBlank()) sessions.remove(token.trim());
    }

    private Session createSession(Hospital hospital) {
        String token = UUID.randomUUID().toString();
        sessions.put(token, hospital.getId());
        return new Session(token, hospital);
    }

    private String requireToken(String token) {
        if (token == null || token.isBlank() || !sessions.containsKey(token.trim())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Your hospital session expired. Please sign in again.");
        }
        return token.trim();
    }

    private static void validate(Hospital.ProfileData data) {
        if (data == null || blank(data.name()) || blank(data.address()) || blank(data.contactName())
                || blank(data.phone()) || blank(data.email())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Complete the required hospital details.");
        }
        if (!Double.isFinite(data.latitude()) || data.latitude() < -90 || data.latitude() > 90
                || !Double.isFinite(data.longitude()) || data.longitude() < -180 || data.longitude() > 180) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a valid hospital location on the map.");
        }
        int[] values = { data.totalBeds(), data.availableBeds(), data.occupiedBeds(), data.reservedBeds(),
                data.icuBeds(), data.emergencyBeds(), data.traumaBeds(), data.isolationBeds() };
        for (int value : values) {
            if (value < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bed counts cannot be negative.");
        }
        if (data.availableBeds() > data.totalBeds()
                || data.availableBeds() + data.occupiedBeds() + data.reservedBeds() > data.totalBeds()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Available, occupied, and reserved beds cannot exceed total beds.");
        }
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }

    private String hashPassword(String password, byte[] salt) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITERATIONS, KEY_BITS);
        try {
            return Base64.getEncoder().encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(spec).getEncoded());
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Password hashing is unavailable.", ex);
        } finally {
            spec.clearPassword();
        }
    }

    private static String normalize(String value) { return value.trim().toLowerCase(Locale.ROOT); }

    private static ResponseStatusException invalidCredentials() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid hospital username/email or password.");
    }

    public record Session(String token, Hospital hospital) { }
}

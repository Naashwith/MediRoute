package com.mediroute.service;

import com.mediroute.entity.Ambulance;
import com.mediroute.entity.CrewAccount;
import com.mediroute.repository.AmbulanceRepository;
import com.mediroute.repository.CrewAccountRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class CrewAuthService {
    private static final int SALT_BYTES = 16;
    private static final int ITERATIONS = 120_000;
    private static final int KEY_BITS = 256;

    private final CrewAccountRepository accounts;
    private final AmbulanceRepository ambulances;
    private final SecureRandom random = new SecureRandom();

    public CrewAuthService(CrewAccountRepository accounts, AmbulanceRepository ambulances) {
        this.accounts = accounts;
        this.ambulances = ambulances;
    }

    @Transactional
    public CrewProfile register(RegisterData data) {
        String crewId = normalize(data.crewId());
        String email = normalize(data.email());
        String fullName = data.fullName().trim();

        if (accounts.existsByCrewId(crewId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That crew ID is already registered.");
        }
        if (accounts.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That email is already registered.");
        }
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        String saltText = Base64.getEncoder().encodeToString(salt);
        String hash = hashPassword(data.password(), salt);

        List<Ambulance> existingAmbulances = ambulances.findAll();
        String unitCode = nextUnitCode(existingAmbulances);
        Ambulance reference = existingAmbulances.stream()
                .filter(a -> a.getLatitude() != null && a.getLongitude() != null)
                .findFirst().orElse(null);
        boolean hasSignupLocation = validCoordinate(data.latitude(), -90, 90)
                && validCoordinate(data.longitude(), -180, 180);
        double latitude = hasSignupLocation ? data.latitude()
                : reference == null ? 13.0827 : reference.getLatitude();
        double longitude = hasSignupLocation ? data.longitude()
                : reference == null ? 80.2707 : reference.getLongitude();

        // One new compounder account owns one newly-created ambulance unit.
        Ambulance newAmbulance = new Ambulance(unitCode, fullName, latitude, longitude);
        if (!hasSignupLocation) newAmbulance.goOffline();
        ambulances.save(newAmbulance);

        CrewAccount saved = accounts.save(new CrewAccount(
                crewId, email, fullName, data.phone().trim(), unitCode,
                data.role().trim(), hash, saltText));
        return profile(saved);
    }

    private String nextUnitCode(List<Ambulance> existing) {
        Pattern pattern = Pattern.compile("^AMB-(\\d+)$", Pattern.CASE_INSENSITIVE);
        int highest = existing.stream()
                .map(Ambulance::getUnitCode)
                .filter(code -> code != null)
                .map(pattern::matcher)
                .filter(Matcher::matches)
                .mapToInt(matcher -> Integer.parseInt(matcher.group(1)))
                .max().orElse(0);
        String candidate;
        do {
            candidate = String.format(Locale.ROOT, "AMB-%02d", ++highest);
        } while (ambulances.existsByUnitCodeIgnoreCase(candidate));
        return candidate;
    }

    private static boolean validCoordinate(Double value, double minimum, double maximum) {
        return value != null && Double.isFinite(value) && value >= minimum && value <= maximum;
    }

    @Transactional(readOnly = true)
    public CrewProfile login(String identifier, String password) {
        String normalized = normalize(identifier);
        CrewAccount account = accounts.findByCrewIdOrEmail(normalized, normalized)
                .orElseThrow(() -> invalidCredentials());

        byte[] salt = Base64.getDecoder().decode(account.getPasswordSalt());
        byte[] expected = Base64.getDecoder().decode(account.getPasswordHash());
        byte[] actual = Base64.getDecoder().decode(hashPassword(password, salt));
        if (!MessageDigest.isEqual(expected, actual)) {
            throw invalidCredentials();
        }
        return profile(account);
    }

    private String hashPassword(String password, byte[] salt) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITERATIONS, KEY_BITS);
        try {
            byte[] encoded = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(spec).getEncoded();
            return Base64.getEncoder().encodeToString(encoded);
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Password hashing is unavailable.", ex);
        } finally {
            spec.clearPassword();
        }
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private static ResponseStatusException invalidCredentials() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid crew ID/email or password.");
    }

    private static CrewProfile profile(CrewAccount account) {
        return new CrewProfile(account.getId(), account.getFullName(), account.getCrewId(),
                account.getEmail(), account.getPhone(), account.getUnitCode(), account.getRole());
    }

    public record RegisterData(String fullName, String crewId, String phone, String email,
                               Double latitude, Double longitude, String role, String password) { }

    public record CrewProfile(Long id, String name, String crewId, String email, String phone,
                              String unit, String role) { }
}

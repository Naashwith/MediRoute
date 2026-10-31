package com.mediroute.controller;

import com.mediroute.entity.Ambulance;
import com.mediroute.entity.Hospital;
import com.mediroute.repository.AmbulanceRepository;
import com.mediroute.repository.EmergencyRepository;
import com.mediroute.repository.HospitalRepository;
import com.mediroute.service.DispatchService;
import com.mediroute.service.HospitalAuthService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ApiController {
    private final DispatchService dispatch;
    private final AmbulanceRepository ambulances;
    private final HospitalRepository hospitals;
    private final EmergencyRepository emergencies;
    private final com.mediroute.signal.SignalPriorityService signals;
    private final HospitalAuthService hospitalAuth;

    public ApiController(DispatchService dispatch, AmbulanceRepository ambulances,
                         HospitalRepository hospitals, EmergencyRepository emergencies,
                         com.mediroute.signal.SignalPriorityService signals,
                         HospitalAuthService hospitalAuth) {
        this.dispatch = dispatch;
        this.ambulances = ambulances;
        this.hospitals = hospitals;
        this.emergencies = emergencies;
        this.signals = signals;
        this.hospitalAuth = hospitalAuth;
    }

    public record EmergencyRequest(@NotBlank String patientName, String contact,
            @DecimalMin("-90") @DecimalMax("90") double latitude,
            @DecimalMin("-180") @DecimalMax("180") double longitude,
            String category, String description) { }
    public record AmbulanceRequest(@NotBlank String unitCode, String crewName, double latitude, double longitude) { }
    public record HospitalRequest(@NotBlank String name, String address, double latitude, double longitude,
            int capacity, int availableBeds, Set<String> capabilities) { }
    public record AssessmentRequest(@NotBlank String symptoms, String requiredCapability) { }
    public record StatusRequest(@NotBlank String status) { }
    public record HospitalChoiceRequest(long hospitalId) { }
    public record LocationRequest(double latitude, double longitude) { }
    public record SignalRequest(@NotBlank String signalId, @NotBlank String emergencyId,
            @Min(1) @jakarta.validation.constraints.Max(120) int durationSeconds) { }
    public record HospitalLoginRequest(@NotBlank @Size(max = 190) String identifier,
            @NotBlank @Size(max = 100) String password) { }

    public record HospitalPortalRequest(
            @Size(min = 3, max = 60) String username,
            @Size(min = 6, max = 100) String password,
            @Size(min = 6, max = 100) String confirmPassword,
            @NotBlank @Size(max = 160) String hospitalName,
            @Size(max = 100) String license,
            @NotBlank @Size(max = 120) String contactName,
            @Size(max = 120) String designation,
            @NotBlank @Size(max = 24) String phone,
            @NotBlank @Email @Size(max = 190) String email,
            @NotBlank @Size(max = 1000) String address,
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
            @NotNull @Min(0) Integer totalBeds,
            @NotNull @Min(0) Integer availableBeds,
            @NotNull @Min(0) Integer occupiedBeds,
            @NotNull @Min(0) Integer reservedBeds,
            @NotNull @Min(0) Integer icuBeds,
            @NotNull @Min(0) Integer emergencyBeds,
            @NotNull @Min(0) Integer traumaBeds,
            @NotNull @Min(0) Integer isolationBeds,
            Set<String> specialties,
            @Size(max = 4000) String doctorDetails,
            Set<String> equipment,
            @Size(max = 2000) String otherEquipment,
            Set<String> bloodGroups,
            @Size(max = 500) String rareBloodGroups,
            Set<String> services,
            @Size(max = 24) String emergencyPhone) { }

    @PostMapping("/emergencies")
    public Object createEmergency(@Valid @RequestBody EmergencyRequest request) {
        var emergency = dispatch.create(request.patientName(), request.contact(), request.latitude(), request.longitude());
        emergency.setDetails(request.category(), request.description());
        return emergencies.save(emergency);
    }
    @PostMapping("/emergencies/{id}/assessment")
    public Object assess(@PathVariable long id, @Valid @RequestBody AssessmentRequest request) {
        return dispatch.assess(id, request.symptoms(), request.requiredCapability());
    }
    @PostMapping("/emergencies/{id}/status")
    public Object status(@PathVariable long id, @Valid @RequestBody StatusRequest request) {
        return dispatch.setStatus(id, request.status());
    }
    @PostMapping("/emergencies/{id}/hospital")
    public Object chooseHospital(@PathVariable long id, @Valid @RequestBody HospitalChoiceRequest request) {
        return dispatch.chooseHospital(id, request.hospitalId());
    }
    @GetMapping("/emergencies/{id}/routes") public Object routes(@PathVariable long id) { return dispatch.routes(id); }
    @GetMapping("/emergencies/{id}") public Object emergency(@PathVariable long id) {
        return emergencies.findById(id).orElseThrow();
    }
    @GetMapping("/emergencies") public Object emergencyList() { return emergencies.findAllByOrderByCreatedAtDesc(); }
    @GetMapping("/emergencies/by-unit/{unitCode}")
    public Object emergenciesForUnit(@PathVariable String unitCode) {
        Set<String> terminal = Set.of("COMPLETED", "CANCELLED", "UNAVAILABLE");
        return emergencies.findAllByOrderByCreatedAtDesc().stream()
                .filter(item -> item.getAmbulance() != null && item.getAmbulance().getUnitCode().equalsIgnoreCase(unitCode))
                .filter(item -> item.getStatus() != null && !terminal.contains(item.getStatus().toUpperCase(Locale.ROOT)))
                .toList();
    }
    @GetMapping("/emergencies/latest") public Object latestEmergency() {
        return emergencies.findTopByOrderByCreatedAtDesc().orElse(null);
    }
    @PostMapping("/ambulances") public Object addAmbulance(@Valid @RequestBody AmbulanceRequest request) {
        return ambulances.save(new Ambulance(request.unitCode(), request.crewName(), request.latitude(), request.longitude()));
    }
    @GetMapping("/ambulances") public Object ambulanceList() { return ambulances.findAll(); }
    @PostMapping("/ambulances/{id}/location")
    public Object location(@PathVariable long id, @RequestBody LocationRequest request) {
        return dispatch.locate(id, request.latitude(), request.longitude());
    }
    @PostMapping("/ambulances/unit/{unitCode}/location")
    public Object crewLocation(@PathVariable String unitCode, @RequestBody LocationRequest request) {
        return dispatch.locateUnit(unitCode, request.latitude(), request.longitude());
    }
    @PostMapping("/hospitals")
    public Object addHospital(@Valid @RequestBody HospitalRequest request) {
        return hospitals.save(new Hospital(request.name(), request.address(), request.latitude(), request.longitude(),
                request.capacity(), request.availableBeds(), request.capabilities()));
    }
    @GetMapping("/hospitals") public Object hospitalList() { return hospitals.findAll(); }

    @PostMapping("/hospital-auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public HospitalAuthService.Session registerHospital(@Valid @RequestBody HospitalPortalRequest request) {
        if (request.username() == null || request.username().isBlank() || request.password() == null
                || request.confirmPassword() == null) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Enter a username and password to create your hospital account.");
        }
        if (!request.password().equals(request.confirmPassword())) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Passwords do not match.");
        }
        return hospitalAuth.register(request.username(), request.password(), profileData(request));
    }
    @PostMapping("/hospital-auth/login")
    public HospitalAuthService.Session loginHospital(@Valid @RequestBody HospitalLoginRequest request) {
        return hospitalAuth.login(request.identifier(), request.password());
    }
    @GetMapping("/hospital-auth/me")
    public Hospital currentHospital(@RequestHeader(value = "Authorization", required = false) String authorization) {
        return hospitalAuth.current(bearer(authorization));
    }
    @PutMapping("/hospital-auth/me")
    public Hospital updateHospital(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @Valid @RequestBody HospitalPortalRequest request) {
        return hospitalAuth.update(bearer(authorization), profileData(request));
    }
    @PostMapping("/hospital-auth/logout")
    public Map<String, Boolean> logoutHospital(@RequestHeader(value = "Authorization", required = false) String authorization) {
        hospitalAuth.logout(bearer(authorization));
        return Map.of("loggedOut", true);
    }

    @PostMapping("/signals/priority")
    public Object signal(@Valid @RequestBody SignalRequest request) {
        return signals.requestPriority(request.signalId(), request.emergencyId(), request.durationSeconds());
    }
    @GetMapping("/signals") public Object signalList() { return signals.list(); }
    @GetMapping("/health") public Map<String, Object> health() {
        return Map.of("ok", true, "service", "MediRoute backend");
    }

    private static String bearer(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) return null;
        return authorization.substring(7).trim();
    }

    private static Hospital.ProfileData profileData(HospitalPortalRequest request) {
        Set<String> specialties = clean(request.specialties());
        Set<String> services = clean(request.services());
        Set<String> capabilities = new LinkedHashSet<>();
        for (String value : specialties) addCapability(capabilities, value);
        for (String value : services) addCapability(capabilities, value);
        return new Hospital.ProfileData(request.hospitalName().trim(), request.address().trim(),
                request.latitude(), request.longitude(), request.totalBeds(), request.availableBeds(),
                request.occupiedBeds(), request.reservedBeds(), request.icuBeds(), request.emergencyBeds(),
                request.traumaBeds(), request.isolationBeds(), cleanText(request.license()),
                request.contactName().trim(), cleanText(request.designation()), request.phone().trim(),
                request.email().trim(), cleanText(request.emergencyPhone()), cleanText(request.doctorDetails()),
                cleanText(request.otherEquipment()), cleanText(request.rareBloodGroups()), specialties,
                clean(request.equipment()), clean(request.bloodGroups()), services, capabilities);
    }

    private static Set<String> clean(Set<String> values) {
        Set<String> result = new LinkedHashSet<>();
        if (values != null) values.stream().filter(value -> value != null && !value.isBlank())
                .map(String::trim).forEach(result::add);
        return result;
    }
    private static String cleanText(String value) { return value == null ? "" : value.trim(); }
    private static void addCapability(Set<String> result, String value) {
        String key = value.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", " ").trim();
        if (key.contains("CARDIAC") || key.contains("CARDIOLOGY") || key.contains("DEFIBRILLATOR")) result.add("CARDIAC");
        if (key.contains("TRAUMA")) result.add("TRAUMA");
        if (key.contains("PEDIATRIC")) result.add("PEDIATRIC");
        if (key.contains("MATERNITY") || key.contains("OBSTETRIC")) result.add("MATERNITY");
        if (key.equals("ICU") || key.contains("INTENSIVE CARE")) result.add("ICU");
        if (key.contains("EMERGENCY") || key.contains("CASUALTY")) result.add("EMERGENCY");
        if (key.contains("GENERAL MEDICINE")) result.add("GENERAL");
    }
}

package com.mediroute.controller;

import com.mediroute.service.CrewAuthService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final CrewAuthService auth;

    public AuthController(CrewAuthService auth) {
        this.auth = auth;
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Size(max = 60) String crewId,
            @NotBlank @Size(max = 24) String phone,
            @NotBlank @Email @Size(max = 190) String email,
            Double latitude,
            Double longitude,
            @NotBlank @Size(max = 50) String role,
            @NotBlank @Size(min = 6, max = 100) String password,
            @NotBlank @Size(min = 6, max = 100) String confirmPassword) { }

    public record LoginRequest(
            @NotBlank @Size(max = 190) String identifier,
            @NotBlank @Size(max = 100) String password) { }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public CrewAuthService.CrewProfile register(@Valid @RequestBody RegisterRequest request) {
        if (!request.password().equals(request.confirmPassword())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Passwords do not match.");
        }
        return auth.register(new CrewAuthService.RegisterData(
                request.name(), request.crewId(), request.phone(), request.email(),
                request.latitude(), request.longitude(), request.role(), request.password()));
    }

    @PostMapping("/login")
    public CrewAuthService.CrewProfile login(@Valid @RequestBody LoginRequest request) {
        return auth.login(request.identifier(), request.password());
    }
}

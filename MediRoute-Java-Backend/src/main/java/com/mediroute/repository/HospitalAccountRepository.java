package com.mediroute.repository;

import com.mediroute.entity.HospitalAccount;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HospitalAccountRepository extends JpaRepository<HospitalAccount, Long> {
    boolean existsByUsernameIgnoreCase(String username);
    boolean existsByEmailIgnoreCase(String email);
    Optional<HospitalAccount> findByUsernameIgnoreCaseOrEmailIgnoreCase(String username, String email);
    Optional<HospitalAccount> findByUsernameIgnoreCase(String username);
    Optional<HospitalAccount> findByEmailIgnoreCase(String email);
    Optional<HospitalAccount> findByHospitalId(Long hospitalId);
}

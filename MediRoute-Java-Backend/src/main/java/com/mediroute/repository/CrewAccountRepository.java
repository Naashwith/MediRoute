package com.mediroute.repository;

import com.mediroute.entity.CrewAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CrewAccountRepository extends JpaRepository<CrewAccount, Long> {
    boolean existsByCrewId(String crewId);
    boolean existsByEmail(String email);
    Optional<CrewAccount> findByCrewIdOrEmail(String crewId, String email);
}

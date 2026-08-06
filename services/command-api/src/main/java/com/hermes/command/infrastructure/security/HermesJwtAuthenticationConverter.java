package com.hermes.command.infrastructure.security;

import com.hermes.command.domain.TenantId;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Collections;

/**
 * Custom JWT converter to extract tenant, user, and role information.
 */
@Component
public class HermesJwtAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        String tenantIdValue = jwt.getClaimAsString("custom:tenantId");
        String userId = jwt.getSubject();
        String role = jwt.getClaimAsString("custom:role");

        if (tenantIdValue != null) {
            TenantContext.set(new TenantId(tenantIdValue), userId, role);
        }

        Collection<GrantedAuthority> authorities = role != null 
            ? Collections.singleton(new SimpleGrantedAuthority("ROLE_" + role)) 
            : Collections.emptyList();

        return new JwtAuthenticationToken(jwt, authorities);
    }
}

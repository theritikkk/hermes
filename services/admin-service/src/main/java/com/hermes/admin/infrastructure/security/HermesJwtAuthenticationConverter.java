package com.hermes.admin.infrastructure.security;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class HermesJwtAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        String tenantId = jwt.getClaimAsString("custom:tenantId");
        if (tenantId != null && !tenantId.isBlank()) {
            TenantContext.setTenantId(tenantId);
        }

        Collection<GrantedAuthority> authorities = extractAuthorities(jwt);
        return new JwtAuthenticationToken(jwt, authorities);
    }

    private Collection<GrantedAuthority> extractAuthorities(Jwt jwt) {
        List<String> cognitoGroups = jwt.getClaimAsStringList("cognito:groups");
        if (cognitoGroups != null) {
            return cognitoGroups.stream()
                    .map(group -> new SimpleGrantedAuthority("ROLE_" + group.toUpperCase()))
                    .collect(Collectors.toList());
        }
        return List.of();
    }
}
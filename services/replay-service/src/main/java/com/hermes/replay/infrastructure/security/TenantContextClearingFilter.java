package com.hermes.replay.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Clears the TenantContext ThreadLocal after every request completes.
 *
 * Why this is necessary:
 * ECS Fargate uses a fixed thread pool (Tomcat default: 200 threads). Without explicit
 * cleanup, a thread that served tenant "acme" carries that TenantContext into the next
 * request it handles. If the next request's JWT converter fails to set a new context
 * (e.g. for a health check endpoint that bypasses auth), TenantContextHolder.getTenantId()
 * would return "acme" — a cross-tenant data leak.
 *
 * Ordering: runs after the security filter chain (which sets the context) and after
 * the handler (which reads it). The finally block guarantees cleanup even on exceptions.
 */
@Component
@Order(Integer.MAX_VALUE)
public class TenantContextClearingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        try {
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }
}

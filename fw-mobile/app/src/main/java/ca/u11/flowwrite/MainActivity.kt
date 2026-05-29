package ca.u11.flowwrite

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import ca.u11.flowwrite.ui.screens.HomeScreen
import ca.u11.flowwrite.ui.screens.OnboardingScreen
import ca.u11.flowwrite.ui.screens.PermissionsScreen
import ca.u11.flowwrite.ui.screens.SignInScreen
import ca.u11.flowwrite.ui.theme.FlowWriteTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            FlowWriteTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    val vm: MainViewModel = viewModel()
                    val screen by vm.screen.collectAsState()

                    when (screen) {
                        AppScreen.Loading -> Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                        }
                        AppScreen.SignIn -> SignInScreen(vm)
                        AppScreen.Onboarding -> OnboardingScreen(vm)
                        AppScreen.Permissions -> PermissionsScreen(vm)
                        AppScreen.Home -> HomeScreen(vm)
                    }
                }
            }
        }
    }
}
